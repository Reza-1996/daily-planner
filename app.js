// ======================
// Daily Planner PWA
// ======================

const STORAGE_KEY = 'daily_planner_tasks';
let tasks = [];
let notificationPermission = Notification.permission;

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  loadTasks();
  renderTasks();
  setTodayDate();
  registerServiceWorker();
  requestNotificationPermission();

  // Event listeners
  document.getElementById('add-btn').addEventListener('click', addTask);
  document.getElementById('task-title').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTask();
  });

  // Check for due reminders every 30 seconds
  setInterval(checkReminders, 30000);
  checkReminders(); // immediate check
});

// ---------- Date ----------
function setTodayDate() {
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const today = new Date().toLocaleDateString('fa-IR', options);
  document.getElementById('today-date').textContent = today;
}

// ---------- Storage ----------
function loadTasks() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    tasks = data ? JSON.parse(data) : [];
  } catch (e) {
    tasks = [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

// ---------- Add Task ----------
function addTask() {
  const titleInput = document.getElementById('task-title');
  const timeInput = document.getElementById('task-time');
  const reminderCheck = document.getElementById('enable-reminder');

  const title = titleInput.value.trim();
  const time = timeInput.value;

  if (!title) {
    showToast('لطفاً عنوان کار را وارد کنید');
    titleInput.focus();
    return;
  }

  if (!time) {
    showToast('لطفاً ساعت را انتخاب کنید');
    timeInput.focus();
    return;
  }

  const [hour, minute] = time.split(':').map(Number);

  const task = {
    id: Date.now().toString(),
    title,
    hour,
    minute,
    timeString: time,
    reminderEnabled: reminderCheck.checked,
    isDone: false,
    notified: false,
    createdAt: new Date().toISOString()
  };

  tasks.push(task);
  tasks.sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute));
  saveTasks();
  renderTasks();

  // Clear form
  titleInput.value = '';
  timeInput.value = '';
  titleInput.focus();

  showToast('کار با موفقیت اضافه شد');

  // Schedule reminder if enabled
  if (task.reminderEnabled) {
    scheduleReminder(task);
  }
}

// ---------- Render ----------
function renderTasks() {
  const list = document.getElementById('tasks-list');
  const empty = document.getElementById('empty-state');
  const countBadge = document.getElementById('task-count');

  countBadge.textContent = tasks.length;

  if (tasks.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  list.innerHTML = tasks.map(task => `
    <div class="task-card ${task.isDone ? 'done' : ''}" data-id="${task.id}">
      <div class="task-time">${formatTime(task.hour, task.minute)}</div>
      <div class="task-content">
        <div class="task-title">${escapeHtml(task.title)}</div>
        ${task.reminderEnabled ? '<div class="task-reminder">🔔 یادآوری فعال</div>' : ''}
      </div>
      <div class="task-actions">
        <button class="action-btn btn-check" onclick="toggleDone('${task.id}')" title="انجام شد">
          ${task.isDone ? '↩️' : '✓'}
        </button>
        <button class="action-btn btn-delete" onclick="deleteTask('${task.id}')" title="حذف">
          🗑️
        </button>
      </div>
    </div>
  `).join('');
}

function formatTime(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ---------- Toggle Done ----------
function toggleDone(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  task.isDone = !task.isDone;
  saveTasks();
  renderTasks();
  showToast(task.isDone ? 'کار انجام شد ✓' : 'کار به حالت اولیه برگشت');
}

// ---------- Delete ----------
function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
  renderTasks();
  showToast('کار حذف شد');
}

// ---------- Notifications ----------
async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.log('این مرورگر از نوتیفیکیشن پشتیبانی نمی‌کند');
    return;
  }

  if (Notification.permission === 'default') {
    notificationPermission = await Notification.requestPermission();
  }
}

function scheduleReminder(task) {
  if (notificationPermission !== 'granted') return;

  const now = new Date();
  const target = new Date();
  target.setHours(task.hour, task.minute, 0, 0);

  // If time already passed today, schedule for tomorrow
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  const delay = target.getTime() - now.getTime();

  // For delays longer than ~24 days, setTimeout is unreliable in browsers.
  // We use a combination of setTimeout (for near future) + checking on load.
  if (delay < 2147483647) { // max safe setTimeout
    setTimeout(() => {
      showNotification(task);
    }, delay);
  }
}

function showNotification(task) {
  if (notificationPermission !== 'granted') return;
  if (task.notified) return;

  // Mark as notified so it doesn't repeat
  task.notified = true;
  saveTasks();

  const notification = new Notification('یادآوری برنامه روزانه', {
    body: task.title,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: task.id,
    requireInteraction: true,
    dir: 'rtl',
    lang: 'fa'
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}

function checkReminders() {
  if (notificationPermission !== 'granted') return;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  tasks.forEach(task => {
    if (task.isDone || !task.reminderEnabled || task.notified) return;

    const taskMinutes = task.hour * 60 + task.minute;

    // If the time has arrived (within the last 2 minutes to avoid missing)
    if (currentMinutes >= taskMinutes && currentMinutes <= taskMinutes + 2) {
      showNotification(task);
    }
  });
}

// ---------- Toast ----------
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

// ---------- Service Worker ----------
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('Service Worker registered:', reg.scope))
      .catch(err => console.log('Service Worker registration failed:', err));
  }
}

// Make functions available globally for onclick
window.toggleDone = toggleDone;
window.deleteTask = deleteTask;
