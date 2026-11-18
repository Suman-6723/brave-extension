/* ======================================================
   TimeTask — App Logic (Optimized)
   Clock, Countdown, Todo, Pomodoro, Bookmarks
   ====================================================== */

(() => {
  'use strict';

  // ─── DOM References (cached once) ───
  const clockHours   = document.getElementById('clock-hours');
  const clockMinutes = document.getElementById('clock-minutes');
  const clockSeconds = document.getElementById('clock-seconds');
  const clockPeriod  = document.getElementById('clock-period');
  const clockDate    = document.getElementById('clock-date');

  const cdDays    = document.getElementById('cd-days');
  const cdHours   = document.getElementById('cd-hours');
  const cdMinutes = document.getElementById('cd-minutes');
  const cdSeconds = document.getElementById('cd-seconds');

  const statTotalTime = document.getElementById('stat-total-time');
  const statTasks     = document.getElementById('stat-tasks');
  const statCompleted = document.getElementById('stat-completed');
  const statElapsed   = document.getElementById('stat-elapsed');

  const taskForm     = document.getElementById('task-form');
  const taskInput    = document.getElementById('task-input');
  const taskHours    = document.getElementById('task-hours');
  const taskMinutes  = document.getElementById('task-minutes');
  const taskList     = document.getElementById('task-list');
  const emptyState   = document.getElementById('empty-state');
  
  const toggleWrap   = document.getElementById('toggle-wrap');
  const toggleBtn    = document.getElementById('toggle-completed-btn');
  const toggleDropdown = document.getElementById('toggle-dropdown');
  const hideCompletedBtn = document.getElementById('hide-completed-btn');
  const hideAllBtn   = document.getElementById('hide-all-btn');

  // Bookmarks
  const bookmarksBtn = document.getElementById('bookmarks-btn');
  const bookmarksModal = document.getElementById('bookmarks-modal');
  const bookmarksCloseBtn = document.getElementById('bookmarks-close-btn');
  const bookmarksTree = document.getElementById('bookmarks-tree');

  // Pomodoro
  const pomoWidget = document.getElementById('pomodoro-widget');
  const pomoModeLabel = document.getElementById('pomo-mode-label');
  const pomoTimeDisplay = document.getElementById('pomo-time');
  const pomoStartBtn = document.getElementById('pomo-start-btn');
  const pomoResetBtn = document.getElementById('pomo-reset-btn');

  const clearDoneBtn = document.getElementById('clear-done-btn');
  const clearAllBtn  = document.getElementById('clear-all-btn');

  // ─── State ───
  const STORAGE_KEY = 'timetask_data';
  let tasks = [];
  let hideMode = 'none'; // 'none', 'completed', 'all'
  let elapsedTotalSeconds = 0;
  let elapsedStartTime = null;

  // Pomodoro State
  const POMO_WORK = 25 * 60;
  const POMO_BREAK = 5 * 60;
  let pomoMode = 'focus'; // 'focus' or 'break'
  let pomoTimeLeft = POMO_WORK;
  let pomoIsRunning = false;

  // Cache previous display values to avoid unnecessary DOM writes
  let prevClock = { h: '', m: '', s: '', p: '', d: '' };
  let prevCD = { d: '', h: '', m: '', s: '' };
  let prevElapsed = '';

  // ─── Persistence ───
  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        tasks = data.tasks || [];
        if (data.hideCompleted) hideMode = 'completed';
        else hideMode = data.hideMode || 'none';
        
        elapsedTotalSeconds = data.elapsedTotalSeconds || 0;
        elapsedStartTime = data.elapsedStartTime || null;

        pomoMode = data.pomoMode || 'focus';
        pomoTimeLeft = data.pomoTimeLeft !== undefined ? data.pomoTimeLeft : POMO_WORK;
      }
    } catch {
      tasks = [];
    }
  }

  function saveTasks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      tasks,
      hideMode,
      elapsedTotalSeconds,
      elapsedStartTime,
      pomoMode,
      pomoTimeLeft
    }));
  }

  // ─── Clock ───
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  function updateClock() {
    const now = new Date();
    let h = now.getHours();
    const m = now.getMinutes();
    const s = now.getSeconds();
    const p = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;

    const hStr = h < 10 ? '0' + h : '' + h;
    const mStr = m < 10 ? '0' + m : '' + m;
    const sStr = s < 10 ? '0' + s : '' + s;

    if (prevClock.h !== hStr) { clockHours.textContent = hStr; prevClock.h = hStr; }
    if (prevClock.m !== mStr) { clockMinutes.textContent = mStr; prevClock.m = mStr; }
    if (prevClock.s !== sStr) { clockSeconds.textContent = sStr; prevClock.s = sStr; }
    if (prevClock.p !== p)    { clockPeriod.textContent = p; prevClock.p = p; }

    const dateStr = `${dayNames[now.getDay()]}, ${now.getDate()} ${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    if (prevClock.d !== dateStr) { clockDate.textContent = dateStr; prevClock.d = dateStr; }
  }

  // ─── Year-End Countdown ───
  // OPTIMIZATION: Cache yearEnd — it never changes within the same year.
  // Previously this created 2 Date objects per second (86,400/day) unnecessarily.
  let _yearEndMs = 0;
  let _yearEndYear = -1;
  function getYearEnd() {
    const yr = new Date().getFullYear();
    if (yr !== _yearEndYear) {
      _yearEndMs = new Date(yr, 11, 31, 23, 59, 59, 999).getTime();
      _yearEndYear = yr;
    }
    return _yearEndMs;
  }

  function updateCountdown() {
    const now = Date.now();
    const diff = getYearEnd() - now;

    if (diff <= 0) return;

    const totalSec = (diff / 1000) | 0;
    const d = (totalSec / 86400) | 0;
    const h = ((totalSec % 86400) / 3600) | 0;
    const m = ((totalSec % 3600) / 60) | 0;
    const s = totalSec % 60;

    const dStr = d < 10 ? '00' + d : d < 100 ? '0' + d : '' + d;
    const hStr = h < 10 ? '0' + h : '' + h;
    const mStr = m < 10 ? '0' + m : '' + m;
    const sStr = s < 10 ? '0' + s : '' + s;

    if (prevCD.d !== dStr) { cdDays.textContent = dStr; prevCD.d = dStr; }
    if (prevCD.h !== hStr) { cdHours.textContent = hStr; prevCD.h = hStr; }
    if (prevCD.m !== mStr) { cdMinutes.textContent = mStr; prevCD.m = mStr; }
    if (prevCD.s !== sStr) { cdSeconds.textContent = sStr; prevCD.s = sStr; }
  }

  // ─── Elapsed timer ───
  function updateElapsedState() {
    if (tasks.length === 0) {
      elapsedTotalSeconds = 0;
      elapsedStartTime = null;
      return;
    }
    
    const hasActiveTasks = tasks.some(t => !t.completed);
    if (hasActiveTasks) {
      if (elapsedStartTime === null) {
        elapsedStartTime = Date.now();
      }
    } else {
      if (elapsedStartTime !== null) {
        elapsedTotalSeconds += (Date.now() - elapsedStartTime) / 1000;
        elapsedStartTime = null;
      }
    }
  }

  function updateElapsed() {
    let currentTotal = elapsedTotalSeconds;
    if (elapsedStartTime !== null) {
      currentTotal += (Date.now() - elapsedStartTime) / 1000;
    }
    const elapsed = Math.floor(currentTotal);
    const eH = Math.floor(elapsed / 3600);
    const eM = Math.floor((elapsed % 3600) / 60);
    const eS = elapsed % 60;
    const str = (eH < 10 ? '0' + eH : eH) + ':' + (eM < 10 ? '0' + eM : eM) + ':' + (eS < 10 ? '0' + eS : eS);

    if (prevElapsed !== str) {
      statElapsed.textContent = str;
      prevElapsed = str;
    }
  }

  // OPTIMIZATION: Cache stat values — avoid DOM writes when nothing changed.
  let _prevStatTotal = '', _prevStatTasks = -1, _prevStatCompleted = -1;
  function updateTaskStats() {
    const totalMinutes = tasks.reduce((sum, t) => sum + (t.hours * 60 + t.minutes), 0);
    const totalH = (totalMinutes / 60) | 0;
    const totalM = totalMinutes % 60;
    const totalStr = totalH + 'h ' + totalM + 'm';
    const completedCount = tasks.filter(t => t.completed).length;
    if (_prevStatTotal !== totalStr)      { statTotalTime.textContent = totalStr; _prevStatTotal = totalStr; }
    if (_prevStatTasks !== tasks.length)  { statTasks.textContent = tasks.length; _prevStatTasks = tasks.length; }
    if (_prevStatCompleted !== completedCount) { statCompleted.textContent = completedCount; _prevStatCompleted = completedCount; }
  }

  // ─── Render Tasks ───
  function renderTasks() {
    taskList.innerHTML = '';

    if (tasks.length === 0) {
      emptyState.classList.remove('hidden');
    } else {
      emptyState.classList.add('hidden');
    }

    const frag = document.createDocumentFragment();
    let visibleIndex = 0;

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      if (hideMode === 'all') continue;
      if (hideMode === 'completed' && task.completed) continue;

      const li = document.createElement('li');
      li.className = task.completed ? 'task-item completed' : 'task-item';
      li.dataset.id = task.id;
      li.draggable = true;
      // OPTIMIZATION: Only stagger animation on single new-task adds, not bulk re-renders.
      // Staggering 10+ tasks on init caused competing animations during first paint.
      if (_isAddingTask) li.style.animationDelay = (visibleIndex * 0.04) + 's';

      const timeStr = formatTime(task.hours, task.minutes);

      li.innerHTML =
        '<span class="task-item__number">' + (i + 1) + '.</span>' +
        '<label class="task-item__checkbox">' +
          '<input type="checkbox"' + (task.completed ? ' checked' : '') + ' data-id="' + task.id + '">' +
          '<span class="task-item__checkmark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span>' +
        '</label>' +
        '<div class="task-item__content">' +
          '<p class="task-item__text">' + escapeHtml(task.text) + '</p>' +
          (timeStr ? '<span class="task-item__time"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' + timeStr + '</span>' : '') +
        '</div>' +
        '<button class="task-item__delete" data-id="' + task.id + '" title="Delete task"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>';

      frag.appendChild(li);
      visibleIndex++;
    }

    taskList.appendChild(frag);
    updateTaskStats();
  }

  function formatTime(h, m) {
    if (h === 0 && m === 0) return '';
    let s = '';
    if (h > 0) s += h + 'h';
    if (h > 0 && m > 0) s += ' ';
    if (m > 0) s += m + 'm';
    return s;
  }

  const escapeDiv = document.createElement('div');
  function escapeHtml(str) {
    escapeDiv.textContent = str;
    return escapeDiv.innerHTML;
  }

  // ─── Task Actions ───
  // Flag used by renderTasks to apply stagger animation only on single adds, not bulk renders.
  let _isAddingTask = false;
  function addTask(text, hours, minutes) {
    tasks.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text: text.trim(),
      hours: parseInt(hours) || 0,
      minutes: parseInt(minutes) || 0,
      completed: false,
      createdAt: Date.now()
    });
    updateElapsedState();
    saveTasks();
    _isAddingTask = true;
    renderTasks();
    _isAddingTask = false;
  }

  function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
      task.completed = !task.completed;
      updateElapsedState();
      saveTasks();
      
      const li = taskList.querySelector('[data-id="' + id + '"]');
      if (li) {
        if (hideMode === 'completed' && task.completed) {
          li.classList.add('removing');
          li.addEventListener('animationend', () => renderTasks(), { once: true });
        } else {
          li.className = task.completed ? 'task-item completed' : 'task-item';
          updateTaskStats();
        }
      } else if (hideMode === 'completed' && !task.completed) {
        renderTasks();
      } else {
        renderTasks();
      }
    }
  }

  function deleteTask(id) {
    const li = taskList.querySelector('[data-id="' + id + '"]');
    if (li) {
      li.classList.add('removing');
      li.addEventListener('animationend', () => {
        tasks = tasks.filter(t => t.id !== id);
        updateElapsedState();
        saveTasks();
        renderTasks();
      }, { once: true });
    } else {
      tasks = tasks.filter(t => t.id !== id);
      updateElapsedState();
      saveTasks();
      renderTasks();
    }
  }

  // ─── Drag & Drop Event Listeners ───
  let draggedTaskId = null;
  let _draggingEl = null; // OPTIMIZATION: cache reference so dragover doesn't querySelector the whole document at 60fps
  let _currentDragOverEl = null;
  
  taskList.addEventListener('dragstart', e => {
    const li = e.target.closest('.task-item');
    if (!li) return;
    draggedTaskId = li.dataset.id;
    _draggingEl = li;
    setTimeout(() => li.classList.add('dragging'), 0);
  });

  taskList.addEventListener('dragend', e => {
    const li = e.target.closest('.task-item');
    if (li) li.classList.remove('dragging');
    draggedTaskId = null;
    _draggingEl = null;
    if (_currentDragOverEl) {
      _currentDragOverEl.classList.remove('drag-over');
      _currentDragOverEl = null;
    }
  });

  taskList.addEventListener('dragover', e => {
    e.preventDefault();
    if (!_draggingEl) return;
    const afterElement = getDragAfterElement(taskList, e.clientY);

    if (_currentDragOverEl !== afterElement) {
      if (_currentDragOverEl) _currentDragOverEl.classList.remove('drag-over');
      if (afterElement) afterElement.classList.add('drag-over');
      _currentDragOverEl = afterElement;
    }
    
    if (afterElement == null) {
      taskList.appendChild(_draggingEl);
    } else {
      taskList.insertBefore(_draggingEl, afterElement);
    }
  });

  taskList.addEventListener('drop', e => {
    e.preventDefault();
    if (_currentDragOverEl) {
      _currentDragOverEl.classList.remove('drag-over');
      _currentDragOverEl = null;
    }
    if (!draggedTaskId) return;
    
    // Reconstruct the tasks array based on new DOM order
    const currentList = Array.from(taskList.querySelectorAll('.task-item'));
    const newOrderIds = currentList.map(li => li.dataset.id);
    
    const tasksMap = {};
    tasks.forEach(t => tasksMap[t.id] = t);
    
    const visibleTasks = newOrderIds.map(id => tasksMap[id]);
    const hiddenTasks = tasks.filter(t => !newOrderIds.includes(t.id));
    
    tasks = [...visibleTasks, ...hiddenTasks];
    saveTasks();
    renderTasks();
  });

  function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.task-item:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  // ─── Task Form Listeners ───
  taskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = taskInput.value.trim();
    if (!text) return;
    addTask(text, taskHours.value, taskMinutes.value);
    taskInput.value = '';
    taskHours.value = '0';
    taskMinutes.value = '00';
    taskInput.focus();
  });

  taskList.addEventListener('change', (e) => {
    if (e.target.type === 'checkbox') toggleTask(e.target.dataset.id);
  });

  taskList.addEventListener('click', (e) => {
    const btn = e.target.closest('.task-item__delete');
    if (btn) deleteTask(btn.dataset.id);
  });

  if (clearDoneBtn) {
    clearDoneBtn.addEventListener('click', () => {
      tasks = tasks.filter(t => !t.completed);
      updateElapsedState();
      saveTasks();
      renderTasks();
    });
  }

  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      if (tasks.length > 0 && confirm('Are you sure you want to clear all tasks?')) {
        tasks = [];
        updateElapsedState();
        saveTasks();
        renderTasks();
      }
    });
  }

  // ─── Dropdown Logic ───
  function updateDropdownUI() {
    hideCompletedBtn.classList.toggle('active', hideMode === 'completed');
    hideAllBtn.classList.toggle('active', hideMode === 'all');
    toggleBtn.classList.toggle('active', hideMode !== 'none');
  }

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown.classList.toggle('show');
  });

  document.addEventListener('click', (e) => {
    if (!toggleWrap.contains(e.target)) {
      toggleDropdown.classList.remove('show');
    }
  });

  hideCompletedBtn.addEventListener('click', () => {
    hideMode = hideMode === 'completed' ? 'none' : 'completed';
    updateDropdownUI();
    toggleDropdown.classList.remove('show');
    saveTasks();
    renderTasks();
  });

  hideAllBtn.addEventListener('click', () => {
    hideMode = hideMode === 'all' ? 'none' : 'all';
    updateDropdownUI();
    toggleDropdown.classList.remove('show');
    saveTasks();
    renderTasks();
  });

  // ─── Pomodoro Logic ───
  // OPTIMIZATION: Cache previous pomodoro display values — avoids silent DOM writes
  // every second when the timer is paused (button text, mode label don't change).
  let _prevPomoTime = '', _prevPomoMode = '', _prevPomoRunning = null;
  let lastPomoTickTime = null;

  function updatePomodoroUI() {
    const m = Math.floor(pomoTimeLeft / 60);
    const s = pomoTimeLeft % 60;
    const timeStr = (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
    const modeStr = pomoMode === 'focus' ? 'FOCUS SESSION' : 'BREAK TIME';
    const btnStr  = pomoIsRunning ? 'Pause' : 'Start';

    if (_prevPomoTime !== timeStr)          { pomoTimeDisplay.textContent = timeStr; _prevPomoTime = timeStr; }
    if (_prevPomoMode !== modeStr)          { pomoModeLabel.textContent = modeStr; _prevPomoMode = modeStr; }
    if (_prevPomoRunning !== pomoIsRunning) { pomoStartBtn.textContent = btnStr; _prevPomoRunning = pomoIsRunning; }

    if (pomoMode === 'break') {
      pomoWidget.classList.add('break');
    } else {
      pomoWidget.classList.remove('break');
    }
  }

  pomoStartBtn.addEventListener('click', () => {
    pomoIsRunning = !pomoIsRunning;
    if (pomoIsRunning) {
      lastPomoTickTime = Date.now();
    } else {
      lastPomoTickTime = null;
    }
    updatePomodoroUI();
  });

  pomoResetBtn.addEventListener('click', () => {
    pomoIsRunning = false;
    lastPomoTickTime = null;
    pomoMode = 'focus';
    pomoTimeLeft = POMO_WORK;
    saveTasks();
    updatePomodoroUI();
  });

  function tickPomodoro() {
    if (!pomoIsRunning) return;
    
    const now = Date.now();
    if (!lastPomoTickTime) {
      lastPomoTickTime = now;
      return;
    }

    const elapsedSeconds = Math.floor((now - lastPomoTickTime) / 1000);
    if (elapsedSeconds < 1) return;

    lastPomoTickTime += elapsedSeconds * 1000;
    pomoTimeLeft = Math.max(0, pomoTimeLeft - elapsedSeconds);

    if (pomoTimeLeft <= 0) {
      if (pomoMode === 'focus') {
        pomoMode = 'break';
        pomoTimeLeft = POMO_BREAK;
      } else {
        pomoMode = 'focus';
        pomoTimeLeft = POMO_WORK;
        pomoIsRunning = false;
        lastPomoTickTime = null;
      }
      saveTasks();
    }
    updatePomodoroUI();
  }

  // ─── Bookmarks Logic ───
  let bookmarksLoaded = false;

  bookmarksBtn.addEventListener('click', () => {
    bookmarksModal.classList.add('show');
    if (!bookmarksLoaded && window.chrome && chrome.bookmarks) {
      chrome.bookmarks.getTree((tree) => {
        const root = tree[0];
        if (root.children) {
          const fragment = document.createDocumentFragment();
          root.children.forEach(child => renderBookmarkNode(child, fragment));
          bookmarksTree.innerHTML = '';
          bookmarksTree.appendChild(fragment);
        }
        bookmarksLoaded = true;
      });
    } else if (!window.chrome || !chrome.bookmarks) {
      bookmarksTree.innerHTML = '<p class="bookmarks-modal__empty">Bookmarks API not available. Ensure you are running as a Chrome Extension with "bookmarks" permission.</p>';
    }
  });

  bookmarksCloseBtn.addEventListener('click', () => {
    bookmarksModal.classList.remove('show');
  });

  bookmarksModal.addEventListener('click', (e) => {
    if (e.target === bookmarksModal) {
      bookmarksModal.classList.remove('show');
    }
  });

  function renderBookmarkNode(node, container) {
    if (node.url) {
      const a = document.createElement('a');
      a.className = 'bm-item';
      a.href = node.url;
      try {
        const urlObj = new URL(node.url);
        const faviconUrl = 'https://www.google.com/s2/favicons?sz=32&domain=' + urlObj.hostname;
        a.innerHTML = '<img class="bm-icon" src="' + faviconUrl + '" alt="" loading="lazy"> ' + escapeHtml(node.title || node.url);
      } catch(e) {
        a.innerHTML = escapeHtml(node.title || node.url);
      }
      container.appendChild(a);
    } else if (node.children && node.children.length > 0) {
      const div = document.createElement('div');
      div.className = 'bm-folder collapsed'; // Start collapsed
      
      const title = document.createElement('div');
      title.className = 'bm-folder-title';
      title.innerHTML = '<svg class="bm-folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' + escapeHtml(node.title);
      
      title.addEventListener('click', () => {
        div.classList.toggle('collapsed');
      });
      div.appendChild(title);
      
      const list = document.createElement('div');
      list.className = 'bm-list';
      node.children.forEach(child => renderBookmarkNode(child, list));
      
      div.appendChild(list);
      container.appendChild(div);
    }
  }


  // ─── Tick loop with Visibility Awareness ───
  // Pauses timer ticks when tab is hidden to save CPU and battery while browsing other sites (e.g. YouTube).
  // Immediately resyncs all clocks, timers, and Pomodoro when the user returns.
  let tickTimeoutId = null;

  function scheduleNextTick() {
    if (document.hidden) return;
    const now = Date.now();
    const delay = 1000 - (now % 1000);
    tickTimeoutId = setTimeout(tick, delay);
  }

  function tick() {
    updateClock();
    updateCountdown();
    updateElapsed();
    tickPomodoro();
    scheduleNextTick();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // PERF: Pause JS tick loop AND signal CSS to pause all infinite animations
      // (background orbs, clock blink, live-pulse dot). This eliminates GPU compositor
      // work while the user is on YouTube or any other tab.
      document.body.classList.add('page-hidden');
      if (tickTimeoutId) {
        clearTimeout(tickTimeoutId);
        tickTimeoutId = null;
      }
    } else {
      document.body.classList.remove('page-hidden');
      updateClock();
      updateCountdown();
      updateElapsed();
      if (pomoIsRunning) {
        tickPomodoro();
      } else {
        updatePomodoroUI();
      }
      scheduleNextTick();
    }
  });

  // ─── Init ───
  loadTasks();
  updateElapsedState(); 
  updateDropdownUI();
  updatePomodoroUI();
  updateClock();
  updateCountdown();
  renderTasks();

  tick(); 

  // PERF: Swap Google Fonts from media="print" to "all" after first paint.
  // This makes the font stylesheet non-render-blocking — the page paints instantly
  // with fallback fonts, then swaps to custom fonts when they load.
  const fontLink = document.getElementById('google-fonts-link');
  if (fontLink) fontLink.media = 'all';

})();
