// background.js — Ultra-Lightweight Event-Driven Digital Wellbeing Tracker
// Designed for zero browser interference: fully debounced storage, minimal IPC, event-driven only.
// PERF FIX: saveSessionState() was previously called on EVERY tab/focus/idle event with 0ms debounce,
// generating a storm of chrome.storage.session.set() IPC calls that lagged YouTube playback.

const HEARTBEAT_ALARM = 'wellbeing-heartbeat';
const IDLE_THRESHOLD_SECONDS = 120;
const STORAGE_COMMIT_DEBOUNCE_MS = 30000; // 30s — local storage batch writes (was 15s)
const SESSION_SAVE_DEBOUNCE_MS = 10000;   // 10s — session state debounce (was 0ms!)
const MAX_ELAPSED_SESSION_MS = 10 * 60 * 1000;

// ─── Session State ───
let activeTabId = null;
let activeDomain = null;
let startTime = null;
let isUserIdle = false;

// ─── Local Storage Batching ───
let cachedWb = null;
let isStorageDirty = false;
let commitTimeout = null;

// ─── Session State Batching ───
// PERF FIX: Previously every single event (tab switch, URL change, focus change)
// did an immediate chrome.storage.session.set(). Now batched with 10s debounce.
let sessionSaveTimeout = null;
let sessionDirty = false;

// ─── Helpers ───
function getTodayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getDomain(url) {
  if (!url) return null;
  try {
    const obj = new URL(url);
    if (obj.protocol !== 'http:' && obj.protocol !== 'https:') return null;
    let domain = obj.hostname;
    if (domain.startsWith('www.')) domain = domain.slice(4);
    return domain;
  } catch (e) {
    return null;
  }
}

// ─── Debounced Session State ───
// Queues a session-state write. Multiple rapid calls within 10s are coalesced into one write.
function queueSessionSave() {
  sessionDirty = true;
  if (!sessionSaveTimeout) {
    sessionSaveTimeout = setTimeout(() => {
      sessionSaveTimeout = null;
      commitSessionState();
    }, SESSION_SAVE_DEBOUNCE_MS);
  }
}

// Writes session state to chrome.storage.session (survives service worker restarts).
// Called directly only on critical events (focus lost, idle, shutdown).
async function commitSessionState(force = false) {
  if (sessionSaveTimeout) {
    clearTimeout(sessionSaveTimeout);
    sessionSaveTimeout = null;
  }
  if (!sessionDirty && !force) return;
  sessionDirty = false;
  try {
    if (chrome.storage?.session) {
      await chrome.storage.session.set({
        _wbSession: { activeTabId, activeDomain, startTime, isUserIdle }
      });
    }
  } catch (e) {
    // storage.session may not be available in all contexts
  }
}

async function restoreSessionState() {
  try {
    if (chrome.storage?.session) {
      const result = await chrome.storage.session.get('_wbSession');
      if (result?._wbSession) {
        const s = result._wbSession;
        activeTabId = s.activeTabId;
        activeDomain = s.activeDomain;
        startTime = s.startTime;
        isUserIdle = s.isUserIdle || false;
        return;
      }
    }
  } catch (e) {}
  await detectCurrentTab();
}

async function detectCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.url) {
      const domain = getDomain(tab.url);
      if (domain) {
        activeTabId = tab.id;
        activeDomain = domain;
        startTime = Date.now();
        queueSessionSave(); // debounced
      }
    }
  } catch (e) {}
}

// ─── Local Storage Batching ───
function queueStorageCommit() {
  isStorageDirty = true;
  if (!commitTimeout) {
    commitTimeout = setTimeout(() => {
      commitTimeout = null;
      commitStorage();
    }, STORAGE_COMMIT_DEBOUNCE_MS);
  }
}

async function commitStorage(force = false) {
  if (commitTimeout) {
    clearTimeout(commitTimeout);
    commitTimeout = null;
  }
  if (!isStorageDirty && !force) return;
  if (!cachedWb) return;
  try {
    isStorageDirty = false;
    await chrome.storage.local.set({ digitalWellbeing: cachedWb });
  } catch (e) {
    isStorageDirty = true; // Retry next cycle
  }
}

// ─── Flush Time to In-Memory Cache ───
async function flushTimeSpent(forceDisk = false) {
  if (!activeDomain || !startTime || isUserIdle) return;

  const now = Date.now();
  let elapsed = now - startTime;
  if (elapsed <= 0) { startTime = now; return; }
  if (elapsed > MAX_ELAPSED_SESSION_MS) elapsed = MAX_ELAPSED_SESSION_MS;

  const today = getTodayStr();

  try {
    if (!cachedWb) {
      const result = await chrome.storage.local.get(['digitalWellbeing']);
      cachedWb = result.digitalWellbeing || {};
    }

    if (!cachedWb[today]) cachedWb[today] = {};
    if (!cachedWb[today][activeDomain]) cachedWb[today][activeDomain] = 0;
    cachedWb[today][activeDomain] += elapsed;

    // Prune data older than 7 days
    const keys = Object.keys(cachedWb);
    if (keys.length > 7) {
      keys.sort();
      for (let i = 0, len = keys.length - 7; i < len; i++) delete cachedWb[keys[i]];
    }

    if (forceDisk) {
      await commitStorage(true);
    } else {
      queueStorageCommit();
    }
  } catch (e) {}

  startTime = now;
  queueSessionSave(); // debounced — was previously immediate!
}

// ─── Tab Change Handler ───
async function handleTabChange(tabId, url) {
  const domain = url ? getDomain(url) : null;

  // SPA navigations (e.g. YouTube route changes) — skip entirely, no I/O
  if (tabId === activeTabId && domain === activeDomain) return;

  await flushTimeSpent(false);

  activeTabId = tabId;
  activeDomain = domain;
  startTime = domain ? Date.now() : null;
  queueSessionSave(); // debounced
}

async function handleFocusLost() {
  await flushTimeSpent(true);
  activeTabId = null;
  activeDomain = null;
  startTime = null;
  await commitSessionState(true); // force immediate — user is leaving the browser
}

// ─── Browser Event Listeners ───

// Tab switched
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    // PERF: Use tabs.query with windowId (one call) instead of tabs.get (same cost but
    // tabs.query returns the full tab object with URL in one shot).
    const [tab] = await chrome.tabs.query({ active: true, windowId: activeInfo.windowId });
    if (tab) await handleTabChange(tab.id, tab.url);
  } catch (e) {}
});

// Tab navigated to a new URL — already filtered to active tab + URL changes only.
// NOTE: This callback fires for ALL tabs' update events, but the filter
// `tabId === activeTabId && changeInfo.url` ensures we bail out in O(1)
// for all non-matching events without any I/O.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === activeTabId && changeInfo.url) {
    handleTabChange(tabId, changeInfo.url);
  }
});

// Tab closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId !== activeTabId) return;
  await flushTimeSpent(false);
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab) await handleTabChange(tab.id, tab.url);
    else await handleFocusLost();
  } catch (e) {
    await handleFocusLost();
  }
});

// Window focus
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await handleFocusLost();
  } else {
    try {
      const [tab] = await chrome.tabs.query({ active: true, windowId });
      if (tab) await handleTabChange(tab.id, tab.url);
    } catch (e) {}
  }
});

// ─── Idle Detection ───
chrome.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS);

chrome.idle.onStateChanged.addListener(async (newState) => {
  if (newState === 'active') {
    isUserIdle = false;
    await detectCurrentTab();
  } else {
    isUserIdle = true;
    await flushTimeSpent(true);
    startTime = null;
    await commitSessionState(true); // force immediate on idle/lock
  }
});

// ─── Heartbeat Alarm ───
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) {
    if (!activeDomain && !startTime) await restoreSessionState();
    await flushTimeSpent(true);
  }
});

// ─── Initialization ───
async function init() {
  await restoreSessionState();
  if (!activeDomain) await detectCurrentTab();

  // Idempotent alarm: only create if it doesn't exist
  chrome.alarms.get(HEARTBEAT_ALARM, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(HEARTBEAT_ALARM, {
        delayInMinutes: 5,
        periodInMinutes: 5
      });
    }
  });
}

init();
