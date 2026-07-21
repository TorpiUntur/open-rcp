const { invoke } = window.__TAURI__.core;

// Elementy ekranowe i nawigacja
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const navDashboard = document.getElementById('nav-dashboard');
const navReports = document.getElementById('nav-reports');
const viewDashboard = document.getElementById('view-dashboard');
const viewReports = document.getElementById('view-reports');

// Logowanie i użytkownik
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const rememberMeInput = document.getElementById('remember-me');
const loginError = document.getElementById('login-error');
const userInfo = document.getElementById('user-info');
const btnLogout = document.getElementById('btn-logout');

// Przyciski RCP
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnPrivate = document.getElementById('btn-private');
const btnBusiness = document.getElementById('btn-business');
const btnReturn = document.getElementById('btn-return');
const statusMsg = document.getElementById('status-msg');
const tableBody = document.getElementById('logs-table-body');

// Modal Edycji
const editDialog = document.getElementById('edit-dialog');
const editForm = document.getElementById('edit-form');
const dialogTitle = document.getElementById('dialog-title');
const editId = document.getElementById('edit-id');
const editDate = document.getElementById('edit-date');
const editTimeIn = document.getElementById('edit-time-in');
const editTimeOut = document.getElementById('edit-time-out');
const editEventType = document.getElementById('edit-event-type');
const btnAddManual = document.getElementById('btn-add-manual');
const btnDialogCancel = document.getElementById('btn-dialog-cancel');

let currentUser = null;

const eventLabels = {
  'work': 'Praca przy biurku',
  'break_private': 'Wyjście prywatne',
  'business': 'Wyjście służbowe'
};

// 1. Sprawdzanie auto-loginu przy starcie
async function initApp() {
  try {
    const user = await invoke('check_auto_login');
    if (user) {
      currentUser = user;
      showAppScreen();
    } else {
      showLoginScreen();
    }
  } catch (err) {
    showLoginScreen();
  }
}

function showLoginScreen() {
  loginScreen.style.display = 'block';
  appScreen.style.display = 'none';
}

function showAppScreen() {
  loginScreen.style.display = 'none';
  appScreen.style.display = 'block';
  userInfo.textContent = `Zalogowany: ${currentUser.username} (${currentUser.role})`;
  switchTab('dashboard');
}

// 2. Nawigacja po zakładkach
navDashboard.addEventListener('click', () => switchTab('dashboard'));
navReports.addEventListener('click', () => switchTab('reports'));

function switchTab(tab) {
  if (tab === 'dashboard') {
    viewDashboard.style.display = 'block';
    viewReports.style.display = 'none';
    navDashboard.classList.add('active');
    navReports.classList.remove('active');
  } else {
    viewDashboard.style.display = 'none';
    viewReports.style.display = 'block';
    navReports.classList.add('active');
    navDashboard.classList.remove('active');
  }
  updateUI();
}

// 3. Logowanie i Wylogowanie
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = "";

  try {
    currentUser = await invoke('login', {
      username: usernameInput.value,
      password: passwordInput.value,
      rememberMe: rememberMeInput.checked
    });
    showAppScreen();
  } catch (err) {
    loginError.textContent = err;
  }
});

btnLogout.addEventListener('click', async () => {
  await invoke('logout');
  currentUser = null;
  showLoginScreen();
});

// Formatowanie sekund
function formatSeconds(totalSeconds, includeSign = true) {
  const sign = totalSeconds < 0 ? "-" : (includeSign ? "+" : "");
  const absSec = Math.abs(totalSeconds);
  const hours = Math.floor(absSec / 3600);
  const minutes = Math.floor((absSec % 3600) / 60);
  const seconds = absSec % 60;
  return `${sign}${hours}h ${minutes}m ${seconds}s`;
}

// 4. Aktualizacja UI
async function updateUI() {
  if (!currentUser) return;

  try {
    // Statystyki
    const stats = await invoke('get_dashboard_stats', { userId: currentUser.id });

    document.getElementById('stat-first-in').textContent = stats.today_first_in 
      ? (stats.today_first_in.split(' ')[1] || stats.today_first_in) 
      : '--:--';
    
    document.getElementById('stat-target-leave').textContent = stats.target_leave_time;
    
    const balanceEl = document.getElementById('stat-balance');
    balanceEl.textContent = formatSeconds(stats.monthly_balance_seconds, true);
    balanceEl.style.color = stats.monthly_balance_seconds >= 0 ? '#a6e3a1' : '#f38ba8';

    document.getElementById('stat-break').textContent = formatSeconds(stats.today_private_break_seconds, false);

    // Tabela wpisów
    const logs = await invoke('get_logs', { userId: currentUser.id });
    
    tableBody.innerHTML = logs.map(log => `
      <tr class="row-${log.event_type}">
        <td>${log.id}</td>
        <td>${log.date}</td>
        <td>${log.time_in.split(' ')[1] || log.time_in}</td>
        <td>${log.time_out ? (log.time_out.split(' ')[1] || log.time_out) : 'W trakcie...'}</td>
        <td>${log.duration_seconds !== null ? formatSeconds(log.duration_seconds, false) : '---'}</td>
        <td><b>${eventLabels[log.event_type] || log.event_type}</b></td>
        <td>
          <button onclick="openEditModal(${log.id}, '${log.date}', '${log.time_in}', '${log.time_out || ''}', '${log.event_type}')" style="padding: 2px 6px; background: #89b4fa; color: #11111b; border: none; border-radius: 3px; cursor: pointer;">Edytuj</button>
          <button onclick="deleteLogEntry(${log.id})" style="padding: 2px 6px; background: #f38ba8; color: #11111b; border: none; border-radius: 3px; cursor: pointer;">Usuń</button>
        </td>
      </tr>
    `).join('');

    // Stan przycisków RCP
    const activeLog = logs.length > 0 && !logs[0].time_out ? logs[0] : null;

    if (!activeLog) {
      btnStart.disabled = false;
      btnStop.disabled = true;
      btnPrivate.disabled = true;
      btnBusiness.disabled = true;
      btnPrivate.style.display = 'inline-block';
      btnBusiness.style.display = 'inline-block';
      btnReturn.style.display = 'none';
    } else if (activeLog.event_type === 'work') {
      btnStart.disabled = true;
      btnStop.disabled = false;
      btnPrivate.disabled = false;
      btnBusiness.disabled = false;
      btnPrivate.style.display = 'inline-block';
      btnBusiness.style.display = 'inline-block';
      btnReturn.style.display = 'none';
    } else {
      btnStart.disabled = true;
      btnStop.disabled = true;
      btnPrivate.style.display = 'none';
      btnBusiness.style.display = 'none';
      btnReturn.style.display = 'inline-block';
    }
  } catch (err) {
    console.error("Błąd UI:", err);
  }
}

// Globalne funkcje wywoływane z tabeli
window.openEditModal = (id, date, timeIn, timeOut, eventType) => {
  dialogTitle.textContent = "Edycja Wpisu #" + id;
  editId.value = id;
  editDate.value = date;
  editTimeIn.value = timeIn.split(' ')[1] || timeIn;
  editTimeOut.value = timeOut ? (timeOut.split(' ')[1] || timeOut) : '';
  editEventType.value = eventType;
  editDialog.showModal();
};

window.deleteLogEntry = async (id) => {
  if (confirm("Czy na pewno chcesz usunąć ten wpis?")) {
    try {
      await invoke('delete_log', { logId: id });
      await updateUI();
    } catch (e) { alert(e); }
  }
};

// Ręczne dodawanie zapomnianego wpisu
btnAddManual.addEventListener('click', () => {
  dialogTitle.textContent = "Dodaj Zapomniany Wpis";
  editId.value = "";
  editDate.value = new Date().toISOString().split('T')[0];
  editTimeIn.value = "08:00:00";
  editTimeOut.value = "16:00:00";
  editEventType.value = "work";
  editDialog.showModal();
});

btnDialogCancel.addEventListener('click', () => editDialog.close());

// Zapisywanie formularza edycji/dodawania
editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    if (editId.value) {
      // Aktualizacja
      await invoke('update_log', {
        logId: parseInt(editId.value),
        date: editDate.value,
        timeIn: editTimeIn.value,
        timeOut: editTimeOut.value || null,
        eventType: editEventType.value
      });
    } else {
      // Nowy wpis
      await invoke('add_manual_log', {
        userId: currentUser.id,
        date: editDate.value,
        timeIn: editTimeIn.value,
        timeOut: editTimeOut.value || null,
        eventType: editEventType.value
      });
    }
    editDialog.close();
    await updateUI();
  } catch (err) {
    alert("Błąd: " + err);
  }
});

// Przyciski RCP
btnStart.addEventListener('click', async () => {
  try {
    statusMsg.textContent = await invoke('clock_in', { userId: currentUser.id, eventType: 'work' });
    await updateUI();
  } catch (e) { statusMsg.textContent = e; }
});

btnPrivate.addEventListener('click', async () => {
  try {
    statusMsg.textContent = await invoke('clock_in', { userId: currentUser.id, eventType: 'break_private' });
    await updateUI();
  } catch (e) { statusMsg.textContent = e; }
});

btnBusiness.addEventListener('click', async () => {
  try {
    statusMsg.textContent = await invoke('clock_in', { userId: currentUser.id, eventType: 'business' });
    await updateUI();
  } catch (e) { statusMsg.textContent = e; }
});

btnReturn.addEventListener('click', async () => {
  try {
    statusMsg.textContent = await invoke('return_to_work', { userId: currentUser.id });
    await updateUI();
  } catch (e) { statusMsg.textContent = e; }
});

btnStop.addEventListener('click', async () => {
  try {
    statusMsg.textContent = await invoke('clock_out', { userId: currentUser.id });
    await updateUI();
  } catch (e) { statusMsg.textContent = e; }
});

// Inicjalizacja
initApp();