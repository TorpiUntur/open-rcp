const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || window.__TAURI_INVOKE__;

// 1. Elementy ekranowe i nawigacja
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');

const navDashboard = document.getElementById('nav-dashboard');
const navReports = document.getElementById('nav-reports');
const navSettings = document.getElementById('nav-settings');
const navAbsences = document.getElementById('nav-absences'); // <-- DODANE

const viewDashboard = document.getElementById('view-dashboard');
const viewReports = document.getElementById('view-reports');
const viewSettings = document.getElementById('view-settings');
const viewAbsences = document.getElementById('view-absences'); // <-- DODANE

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

// Elementy Ustawień i Admina
const formSettingsTarget = document.getElementById('form-settings-target');
const targetHours = document.getElementById('target-hours');
const targetMinutes = document.getElementById('target-minutes');
const targetMsg = document.getElementById('target-msg');
const adminUserPanel = document.getElementById('admin-user-panel');
const formCreateUser = document.getElementById('form-create-user');
const newUsername = document.getElementById('new-username');
const newPassword = document.getElementById('new-password');
const newRole = document.getElementById('new-role');
const createUserMsg = document.getElementById('create-user-msg');

// Elementy Urlopów / L4
const formAddAbsence = document.getElementById('form-add-absence');
const absenceStart = document.getElementById('absence-start');
const absenceEnd = document.getElementById('absence-end');
const absenceType = document.getElementById('absence-type');
const absenceMsg = document.getElementById('absence-msg');
const absencesTableBody = document.getElementById('absences-table-body');

// Zmienne do filtrowania daty
let selectedYear = new Date().getFullYear();
let selectedMonth = new Date().getMonth() + 1; // 1 - 12

let targetUserId = null; // ID użytkownika, którego dane są aktualnie podglądane

let currentStats = null;
let showZeroLeaveMode = true; // true: "Na Zero", false: "Pełny Dzień Pracy (8h)"

let notifiedZero = false;
let notifiedStandard = false;


const adminUserSelectContainer = document.getElementById('admin-user-select-container');
const selectUser = document.getElementById('select-user');

// Elementy selectów
const selectMonth = document.getElementById('select-month');
const selectYear = document.getElementById('select-year');
const chartContainer = document.getElementById('chart-container');

let currentUser = null;

const eventLabels = {
  'work': 'Praca przy biurku',
  'break_private': 'Wyjście prywatne',
  'business': 'Wyjście służbowe'
};

const absenceLabels = {
  'vacation': 'Urlop Wypoczynkowy',
  'sick_leave': 'Zwolnienie Lekarskie (L4)',
  'other': 'Inna Nieobecność'
};

// 2. Inicjalizacja Aplikacji i Sesji
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
  
  if (currentUser.role === 'admin') {
    adminUserPanel.style.display = 'block';
  } else {
    adminUserPanel.style.display = 'none';
  }

  targetUserId = currentUser.id;
  initDateSelectors();
  loadUsersForAdmin();
  switchTab('dashboard');
}

// 3. Obsługa Przełączania Zakładek
navDashboard.addEventListener('click', () => switchTab('dashboard'));
navReports.addEventListener('click', () => switchTab('reports'));
navSettings.addEventListener('click', () => switchTab('settings'));
if (navAbsences) navAbsences.addEventListener('click', () => switchTab('absences'));

function switchTab(tab) {
  viewDashboard.style.display = tab === 'dashboard' ? 'block' : 'none';
  viewReports.style.display = tab === 'reports' ? 'block' : 'none';
  viewSettings.style.display = tab === 'settings' ? 'block' : 'none';
  if (viewAbsences) viewAbsences.style.display = tab === 'absences' ? 'block' : 'none';

  navDashboard.classList.toggle('active', tab === 'dashboard');
  navReports.classList.toggle('active', tab === 'reports');
  navSettings.classList.toggle('active', tab === 'settings');
  if (navAbsences) navAbsences.classList.toggle('active', tab === 'absences');

  if (tab === 'settings') {
    loadSettings();
  } else if (tab === 'absences') {
    loadAbsences();
  } else {
    updateUI();
  }
}

// 4. Logowanie i Wylogowanie
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

const cardToggleLeave = document.getElementById('card-toggle-leave');
const statLeaveLabel = document.getElementById('stat-leave-label');
const statTargetLeave = document.getElementById('stat-target-leave');

// Listener kliknięcia w kafel
if (cardToggleLeave) {
  cardToggleLeave.addEventListener('click', () => {
    showZeroLeaveMode = !showZeroLeaveMode; // Odwracamy stan (true/false)
    renderLeaveTime();                      // Odświeżamy tylko godzinę wyjścia
  });
}

// Funkcja zmieniająca tekst i godzinę w zależności od wybranego trybu
function renderLeaveTime() {
  if (!currentStats || !statTargetLeave) return;

  const now = new Date();
  const currentFormattedTime = now.toTimeString().split(' ')[0]; // np. "14:45:02"

  const targetZero = currentStats.targetLeaveTime || currentStats.target_leave_time || "---";
  const targetStandard = currentStats.standardLeaveTime || currentStats.standard_leave_time || "---";

  // Sprawdzanie przekroczenia czasu dla Na Zero
  const isZeroPassed = targetZero !== "---" && currentFormattedTime >= targetZero;
  // Sprawdzanie przekroczenia czasu dla Pełnego Dnia
  const isStandardPassed = targetStandard !== "---" && currentFormattedTime >= targetStandard;

  if (showZeroLeaveMode) {
    if (statLeaveLabel) statLeaveLabel.textContent = "Wyjście (Na Zero) 🔄";
    statTargetLeave.textContent = targetZero;
    // Zmiana koloru czcionki na zielony po osiągnięciu progu Na Zero
    statTargetLeave.style.color = isZeroPassed ? '#a6e3a1' : 'inherit';
  } else {
    if (statLeaveLabel) statLeaveLabel.textContent = "Wyjście (Pełny Dzień) 🔄";
    statTargetLeave.textContent = targetStandard;
    // Zmiana koloru czcionki na zielony po osiągnięciu 8h
    statTargetLeave.style.color = isStandardPassed ? '#a6e3a1' : 'inherit';
  }

  // LOGIKA POWIADOMIEŃ SYSTEMOWYCH:
  if (isZeroPassed && !notifiedZero) {
    sendSystemNotification("RCP Time Tracker", "Osiągnięto stan NA ZERO! Możesz bezpiecznie wyjść bez zaległości.");
    notifiedZero = true;
  }

  if (isStandardPassed && !notifiedStandard) {
    sendSystemNotification("RCP Time Tracker", "Ukończono pełny dzień pracy (8h)!");
    notifiedStandard = true;
  }
}

// Lokalna data w formacie YYYY-MM-DD (bez przesunięcia UTC)
function localDateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

let lastSeenDate = localDateString();

// Co sekundę: odświeżanie godziny wyjścia + wykrycie zmiany dnia
// (aplikacja otwarta przez północ / wybudzenie komputera następnego dnia)
setInterval(() => {
  const nowDate = localDateString();
  if (nowDate !== lastSeenDate) {
    // Zmiana miesiąca: jeśli Raporty pokazywały "bieżący" miesiąc,
    // przestawiamy je na nowy bieżący (wybór innego miesiąca zostaje bez zmian)
    const prevYear = Number(lastSeenDate.slice(0, 4));
    const prevMonth = Number(lastSeenDate.slice(5, 7));
    if (selectedYear === prevYear && selectedMonth === prevMonth) {
      selectedYear = Number(nowDate.slice(0, 4));
      selectedMonth = Number(nowDate.slice(5, 7));
      if (currentUser) initDateSelectors();
    }

    lastSeenDate = nowDate;
    if (currentUser) updateUI();
  }

  if (currentStats) {
    renderLeaveTime();
  }
}, 1000);

// Zamyka sesje zapomniane w poprzednich dniach (o 22:00) i pokazuje monit
async function closeForgottenSessions() {
  if (!currentUser) return;
  try {
    const closedDates = await invoke('close_forgotten_sessions', { userId: currentUser.id });
    if (closedDates && closedDates.length > 0) {
      const msg = `Zapomniano zamknąć sesję (${closedDates.join(', ')}). ` +
        `Zamknięto ją automatycznie o 22:00 – popraw godzinę wyjścia w zakładce Raporty.`;
      statusMsg.textContent = msg;
      alert(msg);
    }
  } catch (err) {
    console.error("Błąd zamykania zapomnianych sesji:", err);
  }
}

// 5. Odświeżanie Dashboardu i Tabeli Logów
async function updateUI() {
  if (!currentUser) return;
  const activeUserId = targetUserId || currentUser.id;

  await closeForgottenSessions();

  try {
    // Dashboard ZAWSZE liczy bieżący miesiąc – niezależnie od filtra w Raportach
    const now = new Date();
    const stats = await invoke('get_dashboard_stats', {
      userId: Number(activeUserId),
      year: now.getFullYear(),
      month: now.getMonth() + 1
    });

    // Zapisujemy odebrany obiekt do zmiennej globalnej
    currentStats = stats;

    // Wywołujemy naszą funkcję przełączającą godzinę wyjścia
    renderLeaveTime();

    document.getElementById('stat-first-in').textContent = stats.today_first_in 
      ? (stats.today_first_in.split(' ')[1] || stats.today_first_in) 
      : '--:--';
    
    // Usunięto stat-target-leave.textContent, ponieważ obsługuje go renderLeaveTime()
    
    const balanceEl = document.getElementById('stat-balance');
    balanceEl.textContent = formatSeconds(stats.monthly_balance_seconds, true);
    balanceEl.style.color = stats.monthly_balance_seconds >= 0 ? '#a6e3a1' : '#f38ba8';

    document.getElementById('stat-break').textContent = formatSeconds(stats.today_private_break_seconds, false);

    // 2. Pobieranie logów z wybranego miesiąca dla wybranego użytkownika
    const logs = await invoke('get_logs', { 
      userId: Number(activeUserId),
      year: Number(selectedYear),
      month: Number(selectedMonth) // <-- rzutujemy na Number!
    });
    
    tableBody.innerHTML = logs.map(log => `
      <tr class="row-${log.event_type}">
        <td>${log.id}</td>
        <td>${log.date}</td>
        <td>${log.time_in.split(' ')[1] || log.time_in}</td>
        <td>${log.time_out ? (log.time_out.split(' ')[1] || log.time_out) : 'W trakcie...'}</td>
        <td>${log.duration_seconds !== null ? formatSeconds(log.duration_seconds, false) : '---'}</td>
        <td><b>${eventLabels[log.event_type] || log.event_type}</b></td>
        <td>
          <button onclick="openEditModal(${log.id}, '${log.date}', '${log.time_in}', '${log.time_out || ''}', '${log.event_type}')" style="padding: 2px 6px; background: #89b4fa; color: #11111b;">Edytuj</button>
          <button onclick="deleteLogEntry(${log.id})" style="padding: 2px 6px; background: #f38ba8; color: #11111b;">Usuń</button>
        </td>
      </tr>
    `).join('');

    renderChart(logs);

    // Przyciskami RCP steruje tylko aktualnie zalogowany użytkownik na swoje konto.
    // Stan przycisków = dzisiejsza otwarta sesja (niezależnie od filtra w Raportach)
    const activeLog = await invoke('get_active_session', { userId: currentUser.id });

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
// 6. Obsługa Urlopów i Nieobecności
async function loadAbsences() {
  if (!currentUser) return;
  try {
    const list = await invoke('get_absences', { userId: currentUser.id });
    if (absencesTableBody) {
      absencesTableBody.innerHTML = list.map(item => `
        <tr>
          <td>${item.id}</td>
          <td>${item.date}</td>
          <td><b>${absenceLabels[item.absence_type] || item.absence_type}</b></td>
          <td>
            <button onclick="deleteAbsenceEntry(${item.id})" style="padding: 2px 6px; background: #f38ba8; color: #11111b; border: none; border-radius: 3px; cursor: pointer;">Usuń</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error("Błąd ładowania absencji:", err);
  }
}

if (formAddAbsence) {
  formAddAbsence.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (absenceMsg) absenceMsg.textContent = "";

    try {
      const res = await invoke('add_absence', {
        userId: currentUser.id,
        startDate: absenceStart.value,
        endDate: absenceEnd.value,
        absenceType: absenceType.value
      });
      if (absenceMsg) {
        absenceMsg.style.color = "#a6e3a1";
        absenceMsg.textContent = res;
      }
      await loadAbsences();
    } catch (err) {
      if (absenceMsg) {
        absenceMsg.style.color = "#f38ba8";
        absenceMsg.textContent = "Błąd: " + err;
      }
    }
  });
}

window.deleteAbsenceEntry = async (id) => {
  if (confirm("Czy na pewno chcesz usunąć tę nieobecność?")) {
    try {
      await invoke('delete_absence', { absenceId: id });
      await loadAbsences();
    } catch (e) { alert(e); }
  }
};

// Inicjalizacja opcji lat (np. od 2024 do 2030)
function initDateSelectors() {
  selectYear.innerHTML = '';
  for (let y = 2024; y <= 2030; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === selectedYear) opt.selected = true;
    selectYear.appendChild(opt);
  }
  selectMonth.value = selectedMonth;
}

selectMonth.addEventListener('change', (e) => {
  selectedMonth = parseInt(e.target.value);
  updateUI();
});

selectYear.addEventListener('change', (e) => {
  selectedYear = parseInt(e.target.value);
  updateUI();
});

// Funkcja renderująca wykres słupkowy w CSS/HTML
function renderChart(logs) {
  if (!chartContainer) return;
  chartContainer.innerHTML = '';

  // Agregacja sekund pracy per dzień miesiąca
  const dailySeconds = {};
  logs.forEach(log => {
    if ((log.event_type === 'work' || log.event_type === 'business') && log.duration_seconds) {
      dailySeconds[log.date] = (dailySeconds[log.date] || 0) + log.duration_seconds;
    }
  });

  const dates = Object.keys(dailySeconds).sort();
  if (dates.length === 0) {
    chartContainer.innerHTML = '<p style="color: var(--text-dim); margin: auto;">Brak danych do wyświetlenia wykresu dla tego miesiąca.</p>';
    return;
  }

  // Generowanie słupków
  dates.forEach(date => {
    const totalSec = dailySeconds[date];
    const hours = totalSec / 3600;
    // Wysokość słupka (norma 8h = 100px wysokości)
    const heightPx = Math.min(Math.round((hours / 8) * 100), 140);
    const dayNum = date.split('-')[2];

    const barWrapper = document.createElement('div');
    barWrapper.style.display = 'flex';
    barWrapper.style.flexDirection = 'column';
    barWrapper.style.alignItems = 'center';
    barWrapper.style.flex = '1';
    barWrapper.style.minWidth = '24px';
    barWrapper.title = `${date}: ${formatSeconds(totalSec, false)}`;

    barWrapper.innerHTML = `
      <span style="font-size: 0.7em; color: var(--text-sub); margin-bottom: 4px;">${hours.toFixed(1)}h</span>
      <div style="width: 100%; max-width: 20px; height: ${heightPx}px; background: ${hours >= 8 ? 'var(--accent-green)' : 'var(--accent-blue)'}; border-radius: 4px 4px 0 0;"></div>
      <span style="font-size: 0.75em; font-weight: bold; margin-top: 4px;">${dayNum}</span>
    `;

    chartContainer.appendChild(barWrapper);
  });
}

// 7. Obsługa Ustawień
async function loadSettings() {
  try {
    const totalSeconds = await invoke('get_daily_target_seconds');
    targetHours.value = Math.floor(totalSeconds / 3600);
    targetMinutes.value = Math.floor((totalSeconds % 3600) / 60);
  } catch (err) {
    console.error("Błąd ładowania ustawień:", err);
  }
}

formSettingsTarget.addEventListener('submit', async (e) => {
  e.preventDefault();
  targetMsg.textContent = "";
  const h = parseInt(targetHours.value) || 0;
  const m = parseInt(targetMinutes.value) || 0;
  const totalSec = (h * 3600) + (m * 60);

  try {
    targetMsg.textContent = await invoke('set_daily_target_seconds', { seconds: totalSec });
  } catch (err) {
    targetMsg.textContent = "Błąd: " + err;
  }
});

formCreateUser.addEventListener('submit', async (e) => {
  e.preventDefault();
  createUserMsg.textContent = "";

  try {
    const msg = await invoke('create_user', {
      username: newUsername.value,
      password: newPassword.value,
      role: newRole.value
    });
    createUserMsg.style.color = "#a6e3a1";
    createUserMsg.textContent = msg;
    newUsername.value = "";
    newPassword.value = "";
  } catch (err) {
    createUserMsg.style.color = "#f38ba8";
    createUserMsg.textContent = err;
  }
});

// Modale i Formularze
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

editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    if (editId.value) {
      await invoke('update_log', {
        logId: parseInt(editId.value),
        date: editDate.value,
        timeIn: editTimeIn.value,
        timeOut: editTimeOut.value || null,
        eventType: editEventType.value
      });
    } else {
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

// Rejestracja Czasu Pracy
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

// Obsługa Eksportu CSV
document.getElementById('btn-export-csv').addEventListener('click', async () => {
  const csvMsg = document.getElementById('csv-msg');
  try {
    const csvContent = await invoke('export_csv_data', { userId: currentUser.id });
    
    // Pobranie pliku przez przeglądarkę
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `rcp_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    csvMsg.style.color = "#a6e3a1";
    csvMsg.textContent = "Wygenerowano plik CSV!";
  } catch (err) {
    csvMsg.style.color = "#f38ba8";
    csvMsg.textContent = "Błąd eksportu: " + err;
  }
});

// Obsługa Importu CSV
document.getElementById('input-import-csv').addEventListener('change', (e) => {
  const file = e.target.files[0];
  const csvMsg = document.getElementById('csv-msg');
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const content = event.target.result;
      const res = await invoke('import_csv_data', {
        userId: currentUser.id,
        csvContent: content
      });
      csvMsg.style.color = "#a6e3a1";
      csvMsg.textContent = res;
      await updateUI();
    } catch (err) {
      csvMsg.style.color = "#f38ba8";
      csvMsg.textContent = "Błąd importu: " + err;
    }
  };
  reader.readAsText(file);
});

async function loadUsersForAdmin() {
  if (currentUser.role !== 'admin') {
    adminUserSelectContainer.style.display = 'none';
    targetUserId = currentUser.id;
    return;
  }

  try {
    adminUserSelectContainer.style.display = 'block';
    const users = await invoke('get_all_users');
    selectUser.innerHTML = '';

    users.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = `${u.username} (${u.role})`;
      if (u.id === currentUser.id) opt.selected = true;
      selectUser.appendChild(opt);
    });

    targetUserId = parseInt(selectUser.value) || currentUser.id;
  } catch (err) {
    console.error("Błąd pobierania użytkowników:", err);
  }
}

// Reakcja na zmianę wybranego pracownika w liście
selectUser.addEventListener('change', (e) => {
  targetUserId = parseInt(e.target.value);
  updateUI();
});

async function sendSystemNotification(title, body) {
  try {
    if (window.__TAURI__?.notification) {
      const permissionGranted = await window.__TAURI__.notification.isPermissionGranted();
      if (!permissionGranted) {
        const permission = await window.__TAURI__.notification.requestPermission();
        if (permission !== 'granted') return;
      }
      await window.__TAURI__.notification.sendNotification({ title, body });
    }
  } catch (err) {
    console.error("Błąd wysyłania powiadomienia:", err);
  }
}

/**
 * Konwertuje sekundy na format tekstowy "Xh Ym Zs" z dokładnością do sekund
 * @param {number} totalSeconds - Liczba sekund
 * @param {boolean} showPlus - Czy pokazywać znak '+' przy dodatnich wartościach (dla salda)
 */
function formatSeconds(totalSeconds, showPlus = false) {
  if (totalSeconds === null || totalSeconds === undefined || isNaN(totalSeconds)) {
    return '0s';
  }

  const isNegative = totalSeconds < 0;
  const absSeconds = Math.abs(totalSeconds);

  const hours = Math.floor(absSeconds / 3600);
  const minutes = Math.floor((absSeconds % 3600) / 60);
  const seconds = absSeconds % 60;

  let result = "";

  if (hours > 0) {
    result = `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    result = `${minutes}m ${seconds}s`;
  } else {
    result = `${seconds}s`;
  }

  if (isNegative) {
    return `-${result}`;
  } else if (showPlus && totalSeconds > 0) {
    return `+${result}`;
  }

  return result;
}

let liveTimerInterval = null;

/**
 * Uruchamia odliczanie w czasie rzeczywistym dla salda i statystyk
 */
function startLiveTimer() {
  // Czyszczenie poprzedniego interwału (jeśli istniał)
  if (liveTimerInterval) clearInterval(liveTimerInterval);

  liveTimerInterval = setInterval(() => {
    // Odświeżamy kartę godziny wyjścia (dla powiadomień i koloru czcionki)
    if (typeof renderLeaveTime === 'function') {
      renderLeaveTime();
    }

    // Jeśli nie mamy pobranych statystyk, nic więcej nie robimy
    if (!currentStats) return;

    // Pobieramy aktywną sesję (jeśli użytkownik pracuje lub jest na przerwie)
    const balanceEl = document.getElementById('stat-balance');
    const breakEl = document.getElementById('stat-break');

    // Jeśli sesja jest otwarta (praca trwa)
    if (currentStats.has_active_work) {
      currentStats.monthly_balance_seconds += 1;
      
      if (balanceEl) {
        balanceEl.textContent = formatSeconds(currentStats.monthly_balance_seconds, true);
        balanceEl.style.color = currentStats.monthly_balance_seconds >= 0 ? '#a6e3a1' : '#f38ba8';
      }
    } 
    // Jeśli trwa przerwa prywatna
    else if (currentStats.has_active_private_break) {
      currentStats.today_private_break_seconds += 1;
      
      if (breakEl) {
        breakEl.textContent = formatSeconds(currentStats.today_private_break_seconds, false);
      }
    }
  }, 1000); // 1000ms = 1 sekunda
}
// Start
initApp();