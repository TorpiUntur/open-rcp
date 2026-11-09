const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || window.__TAURI_INVOKE__;

// === Diagnostyka startu (#13) ===
// 1) Sygnał dla watchdoga w Rust: strona się załadowała i komunikacja z Rust działa.
//    Brak tego sygnału w 15 s → Rust przeładuje stronę (i zapisze to w logu).
// 2) Błędy JS trafiają do pliku logu (%LOCALAPPDATA%\com.rcp.timetracker\logs\rcp.log).
if (invoke) {
  invoke('frontend_ready').catch(() => {});

  const sendLog = (msg) => invoke('log_frontend', { message: String(msg) }).catch(() => {});
  window.addEventListener('error', (e) => sendLog(`Błąd JS: ${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => sendLog(`Nieobsłużony błąd Promise: ${e.reason}`));
}

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

// Zasada: Dashboard (statystyki, przyciski RCP, powiadomienia) i Urlopy = ZAWSZE zalogowany użytkownik.
// Raporty (tabela, wykres, dodawanie/edycja/usuwanie wpisów, import/eksport CSV) = użytkownik
// wybrany w liście "Pracownik" (admin), domyślnie zalogowany.
function viewedUserId() {
  return targetUserId || currentUser.id;
}

function viewedUserName() {
  if (viewedUserId() === currentUser.id) return currentUser.username;
  const opt = selectUser.selectedOptions && selectUser.selectedOptions[0];
  return opt ? opt.textContent.split(' ')[0] : `user${viewedUserId()}`;
}

function isViewingOtherUser() {
  return currentUser && viewedUserId() !== currentUser.id;
}

let currentStats = null;

// Stan "próg osiągnięty" z poprzedniego sprawdzenia (co 1 s).
// Powiadomienie idzie przy przejściu false → true, więc:
//  - nowy dzień (brak wejścia → "---") automatycznie resetuje stan,
//  - jeśli godzina wyjścia przesunie się później (np. po wyjściu prywatnym),
//    powiadomienie przyjdzie ponownie, gdy nowy próg zostanie osiągnięty.
let notifiedZero = false;
let notifiedStandard = false;

function resetLeaveNotifications() {
  notifiedZero = false;
  notifiedStandard = false;
}

// Sekundy → "8h" / "7h 30m"
function formatHoursMinutes(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}


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
  'vacation': 'Urlop wypoczynkowy',
  'sick_leave': 'Zwolnienie lekarskie (L4)',
  'other': 'Inna nieobecność'
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
  userInfo.textContent = currentUser.username;
  userInfo.title = `Zalogowany: ${currentUser.username} (${currentUser.role})`;
  
  if (currentUser.role === 'admin') {
    adminUserPanel.style.display = 'block';
  } else {
    adminUserPanel.style.display = 'none';
  }

  targetUserId = currentUser.id;
  // Świeży stan po zalogowaniu (np. inny użytkownik)
  currentStats = null;
  todayLogs = [];
  recentDays = [];
  lastAxisRenderKey = '';
  resetLeaveNotifications();
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
  // Po wylogowaniu nie liczymy już godzin wyjścia ani nie wysyłamy powiadomień
  currentStats = null;
  resetLeaveNotifications();
  showLoginScreen();
});

// "YYYY-MM-DD HH:MM:SS" → Date w czasie lokalnym (null, jeśli brak / błędny format)
function parseLocalTimestamp(ts) {
  if (!ts || ts === '---' || !ts.includes(' ')) return null;
  const d = new Date(ts.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

// Powiadomienia "na zero" / "pełny dzień" (nazwa funkcji zostaje – woła ją interwał co 1 s).
// Redesign etap 2: próg liczony z FAKTYCZNIE przepracowanego czasu (computeDayState),
// a nie z godziny wyjścia z backendu. Dzięki temu:
//  - wyjście prywatne w toku przesuwa próg (wcześniej dopiero po powrocie),
//  - po Stop przed normą powiadomienie nie przychodzi "z zegara".
function renderLeaveTime() {
  if (!currentStats) return;

  const st = computeDayState();
  const started = st.firstIn !== null;
  const isZeroPassed = started && st.toZero <= 0;
  const isStandardPassed = started && !st.freeDay && st.toFull <= 0;

  // LOGIKA POWIADOMIEŃ SYSTEMOWYCH (przy przejściu "nieosiągnięte" → "osiągnięte"):
  if (isZeroPassed && !notifiedZero) {
    sendSystemNotification("RCP Time Tracker", "Osiągnięto stan NA ZERO! Możesz bezpiecznie wyjść bez zaległości.");
  }
  notifiedZero = isZeroPassed;

  if (isStandardPassed && !notifiedStandard) {
    const target = currentStats.daily_target_seconds;
    const targetText = target ? ` (${formatHoursMinutes(target)})` : '';
    sendSystemNotification("RCP Time Tracker", `Ukończono pełny dzień pracy${targetText}!`);
  }
  notifiedStandard = isStandardPassed;
}

// Saldo miesięczne do wyświetlenia (1.1.1 – tryb real time).
// W trakcie dnia (otwarta sesja) saldo = poprzednie dni; dzisiejszy wynik
// doliczamy dopiero, gdy dziś przepracowany czas przekroczy normę dnia –
// od tego momentu saldo rośnie sekunda po sekundzie (dług maleje,
// po przejściu przez zero rośnie nadwyżka). Na wyjściu prywatnym saldo stoi.
// Bez otwartej sesji (po Stop) – wartość z backendu, jak dotąd.
function currentBalanceSeconds() {
  if (!currentStats) return 0;
  const s = currentStats;
  // Brak otwartej sesji (dzień zakończony / jeszcze nie zaczęty) – saldo z backendu
  if (!s.today_has_open_session) return s.monthly_balance_seconds;

  const openSince = parseLocalTimestamp(s.open_work_since); // null na wyjściu prywatnym
  let workedToday = s.today_closed_work_seconds || 0;
  if (openSince !== null) {
    workedToday += Math.max(0, Math.floor((Date.now() - openSince.getTime()) / 1000));
  }
  const overTarget = workedToday - (s.daily_target_seconds || 0);
  return s.previous_days_balance_seconds + Math.max(0, overTarget);
}

function renderBalance() {
  const balanceEl = document.getElementById('stat-balance');
  if (!balanceEl || !currentStats) return;
  const balance = currentBalanceSeconds();
  balanceEl.textContent = formatSeconds(balance, true);
  balanceEl.style.color = balance >= 0 ? 'var(--positive)' : 'var(--negative)';
}

// Nagłówek ekranu Dziś: dzień tygodnia + data ("Poniedziałek" / "9 listopada 2026")
const WEEKDAYS_LONG = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
const WEEKDAYS_SHORT = ['nd', 'pn', 'wt', 'śr', 'czw', 'pt', 'sob'];
const MONTHS_GENITIVE = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];

function renderTodayHeader() {
  const now = new Date();
  const weekdayEl = document.getElementById('today-weekday');
  const dateEl = document.getElementById('today-date');
  if (weekdayEl) weekdayEl.textContent = WEEKDAYS_LONG[now.getDay()];
  if (dateEl) dateEl.textContent = `${now.getDate()} ${MONTHS_GENITIVE[now.getMonth()]} ${now.getFullYear()}`;
}

// "YYYY-MM-DD" → "30.10" + skrót dnia tygodnia ("pt")
function formatDayLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wd = WEEKDAYS_SHORT[new Date(y, m - 1, d).getDay()];
  return `<b>${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}</b> <span class="muted">${wd}</span>`;
}

// "YYYY-MM-DD HH:MM:SS" → "HH:MM:SS"
function timePart(ts) {
  return ts ? (ts.split(' ')[1] || ts) : '';
}

// ==========================================
// EKRAN DZIŚ (redesign etap 2): liczniki, oś dnia, ostatnie dni
// ==========================================
const MONTHS_NOMINATIVE = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
  'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const eventShort = { work: 'Praca', break_private: 'Prywatne', business: 'Służbowe' };

let todayLogs = [];               // dzisiejsze wpisy zalogowanego użytkownika (rosnąco po godzinie)
let recentDays = [];              // [{ date, seconds }] – ostatnie dni z pracą przed dziś (rosnąco)
let defaultTargetSeconds = 28800; // bieżąca norma z ustawień (do sald poprzednich dni)
let lastAxisRenderKey = '';       // oś i ostatnie dni przerysowujemy raz na minutę (lub po zmianie danych)

// Polskie święta ustawowe – kopia logiki z time_calc.rs (easter_sunday / is_polish_holiday)
function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function isPolishHoliday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const md = `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const fixed = ['01-01', '01-06', '05-01', '05-03', '08-15', '11-01', '11-11', '12-25', '12-26'];
  if (fixed.includes(md)) return true;
  if (md === '12-24' && y >= 2025) return true;
  const easter = easterSunday(y);
  const date = new Date(y, m - 1, d);
  const diffDays = Math.round((date - easter) / 86400000);
  // Wielkanoc, Poniedziałek Wielkanocny, Zielone Świątki (+49), Boże Ciało (+60)
  return [0, 1, 49, 60].includes(diffDays);
}

function isNonWorkingDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wd = new Date(y, m - 1, d).getDay();
  return wd === 0 || wd === 6 || isPolishHoliday(dateStr);
}

const pad2 = (n) => String(n).padStart(2, '0');

// Date → "HH:MM"
function hhmm(d) {
  return d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '--:--';
}

// Sekundy → "G:MM" (opcjonalnie ze znakiem)
function formatHM(totalSeconds, showSign = false) {
  const neg = totalSeconds < 0;
  const abs = Math.abs(Math.round(totalSeconds || 0));
  const text = `${Math.floor(abs / 3600)}:${pad2(Math.floor((abs % 3600) / 60))}`;
  if (neg) return `−${text}`;
  return showSign && abs >= 60 ? `+${text}` : text;
}

function setText(id, text, color) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  if (color !== undefined) el.style.color = color;
}

// Dziś przepracowane (praca + służbowe) na żywo
function todayWorkedSeconds() {
  if (!currentStats) return 0;
  let worked = currentStats.today_closed_work_seconds || 0;
  const openSince = parseLocalTimestamp(currentStats.open_work_since);
  if (openSince !== null) {
    worked += Math.max(0, Math.floor((Date.now() - openSince.getTime()) / 1000));
  }
  return worked;
}

// Dziś na wyjściach prywatnych na żywo (zamknięte z backendu + trwające)
function todayPrivateSeconds() {
  let total = currentStats ? (currentStats.today_private_break_seconds || 0) : 0;
  const open = todayLogs.find(l => !l.time_out && l.event_type === 'break_private');
  const since = open ? parseLocalTimestamp(open.time_in) : null;
  if (since) total += Math.max(0, Math.floor((Date.now() - since.getTime()) / 1000));
  return total;
}

// Stan dnia liczony z faktycznie przepracowanego czasu.
// toFull / toZero > 0 → tyle pracy zostało; ≤ 0 → próg osiągnięty (nadwyżka = −wartość).
// Prognozy godzin zakładają pracę bez przerw od teraz – tylko gdy dzień trwa.
function computeDayState() {
  const s = currentStats;
  const now = new Date();
  const norm = s.daily_target_seconds || 0;
  const worked = todayWorkedSeconds();
  const firstIn = parseLocalTimestamp(s.today_first_in);
  const openSince = parseLocalTimestamp(s.open_work_since);
  const hasOpen = !!s.today_has_open_session;
  const freeDay = norm === 0; // weekend / święto
  const toFull = norm - worked;
  const toZero = norm - (s.previous_days_balance_seconds || 0) - worked;

  const projFull = hasOpen && !freeDay && toFull > 0 ? new Date(now.getTime() + toFull * 1000) : null;
  const projZero = hasOpen && toZero > 0 ? new Date(now.getTime() + toZero * 1000) : null;

  // Moment osiągnięcia progu – znany, gdy nastąpił w trakcie bieżącej, nieprzerwanej sesji pracy
  const reachedAt = (overSeconds) => {
    if (openSince === null) return null;
    const t = now.getTime() - overSeconds * 1000;
    return t >= openSince.getTime() ? new Date(t) : null;
  };
  const fullAt = !freeDay && toFull <= 0 ? reachedAt(-toFull) : null;
  const zeroAt = toZero <= 0 ? reachedAt(-toZero) : null;

  return { now, norm, worked, firstIn, hasOpen, isWorking: openSince !== null, freeDay,
    toFull, toZero, projFull, projZero, fullAt, zeroAt };
}

// Liczniki (co sekundę) + oś dnia i ostatnie dni (raz na minutę lub po zmianie danych)
function renderToday(force = false) {
  if (!currentStats) return;
  const st = computeDayState();

  // Przepracowano
  setText('stat-worked', formatSeconds(st.worked));
  setText('stat-worked-sub', st.firstIn
    ? `od ${hhmm(st.firstIn)} · prywatne ${formatHM(todayPrivateSeconds())}`
    : 'praca jeszcze nierozpoczęta');

  // Do pełnego dnia
  if (st.freeDay) {
    setText('stat-to-full', '—', 'inherit');
    setText('stat-to-full-sub', 'dzień wolny – całość to nadgodziny');
  } else if (st.toFull > 0) {
    setText('stat-to-full', formatSeconds(st.toFull), 'inherit');
    setText('stat-to-full-sub', st.projFull
      ? `pełny dzień o ${hhmm(st.projFull)}`
      : (st.firstIn ? 'dzień zakończony' : `norma ${formatHM(st.norm)}`));
  } else {
    setText('stat-to-full', `+${formatSeconds(-st.toFull)}`, 'var(--accent)');
    setText('stat-to-full-sub', st.fullAt ? `osiągnięto o ${hhmm(st.fullAt)}` : 'norma osiągnięta');
  }

  // Do zera
  if (st.toZero > 0) {
    setText('stat-to-zero', formatSeconds(st.toZero), 'inherit');
    setText('stat-to-zero-sub', st.projZero
      ? `na zero o ${hhmm(st.projZero)}`
      : (st.firstIn ? 'dzień zakończony' : 'od rozpoczęcia pracy'));
  } else {
    setText('stat-to-zero', `+${formatSeconds(-st.toZero)}`, 'var(--accent)');
    setText('stat-to-zero-sub', st.zeroAt ? `osiągnięto o ${hhmm(st.zeroAt)}` : 'saldo na zero osiągnięte');
  }

  setText('stat-balance-sub', MONTHS_NOMINATIVE[st.now.getMonth()]);
  setText('nav-today-worked', st.firstIn ? formatHM(st.worked) : '');

  const key = `${hhmm(st.now)}|${todayLogs.length}|${st.hasOpen}|${st.isWorking}`;
  if (force || key !== lastAxisRenderKey) {
    lastAxisRenderKey = key;
    renderDayAxis(st);
    renderRecentDays(st);
  }
}

function renderDayAxis(st) {
  const el = document.getElementById('day-axis');
  if (!el) return;
  if (todayLogs.length === 0) {
    el.innerHTML = '<p class="axis-empty">Brak wpisów z dzisiaj – oś pojawi się po rozpoczęciu pracy.</p>';
    return;
  }

  const now = st.now;
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const hourOf = (d) => (d.getTime() - dayStart.getTime()) / 3600000;

  // Zakres osi: domyślnie 06–20, poszerzany o wpisy i prognozy (pełne parzyste godziny)
  const hours = [hourOf(now)];
  todayLogs.forEach(l => {
    const a = parseLocalTimestamp(l.time_in);
    const b = parseLocalTimestamp(l.time_out);
    if (a) hours.push(hourOf(a));
    if (b) hours.push(hourOf(b));
  });
  if (st.projFull) hours.push(hourOf(st.projFull));
  if (st.projZero) hours.push(hourOf(st.projZero));
  let lo = Math.min(6, Math.floor(Math.min(...hours)));
  let hi = Math.max(20, Math.ceil(Math.max(...hours)));
  lo = Math.max(0, lo - (lo % 2));
  hi = Math.min(24, hi + (hi % 2));
  const pos = (d) => Math.min(100, Math.max(0, (hourOf(d) - lo) / (hi - lo) * 100));
  const edgeClass = (p) => (p < 6 ? 'edge-left' : p > 94 ? 'edge-right' : '');

  // Bloki wpisów
  const blocks = todayLogs.map(l => {
    const a = parseLocalTimestamp(l.time_in);
    if (!a) return '';
    const b = parseLocalTimestamp(l.time_out) || now;
    const left = pos(a);
    const width = Math.max(0, pos(b) - left);
    const dur = Math.max(0, Math.floor((b - a) / 1000));
    const label = width > 12 ? `${eventShort[l.event_type] || ''} · ${formatHM(dur)}` : '';
    const title = `${eventLabels[l.event_type] || l.event_type}: ${hhmm(a)}–${l.time_out ? hhmm(b) : 'teraz'} (${formatHM(dur)})`;
    return `<div class="axis-block ${l.event_type}" style="left: ${left}%; width: ${width}%;" title="${title}">${label}</div>`;
  }).join('');

  // Prognoza do końca dnia: paski do pełnego dnia, przerywana ramka do zera
  const nowP = pos(now);
  let plan = '';
  if (st.projFull) {
    plan += `<div class="axis-plan" style="left: ${nowP}%; width: ${pos(st.projFull) - nowP}%;"></div>`;
  }
  if (st.projZero) {
    const from = st.projFull && st.projFull < st.projZero ? st.projFull : now;
    if (st.projZero > from) {
      plan += `<div class="axis-plan axis-plan-zero" style="left: ${pos(from)}%; width: ${pos(st.projZero) - pos(from)}%;"></div>`;
    }
  }

  // Znaczniki: wejście, pełny dzień, na zero
  const marks = [];
  if (st.firstIn) marks.push({ p: pos(st.firstIn), time: hhmm(st.firstIn), text: 'wejście', cls: '', line: false });
  const fullTime = st.projFull || st.fullAt;
  if (!st.freeDay && fullTime) {
    marks.push({ p: pos(fullTime), time: hhmm(fullTime), text: 'pełny dzień', cls: st.fullAt ? 'reached' : '', line: true });
  }
  const zeroTime = st.projZero || st.zeroAt;
  if (zeroTime) {
    marks.push({ p: pos(zeroTime), time: hhmm(zeroTime), text: 'na zero', cls: st.zeroAt ? 'reached' : 'zero', line: true });
  }
  marks.sort((x, y) => x.p - y.p);
  // Etykiety blisko siebie idą do drugiego rzędu
  const lastInRow = [-100, -100];
  marks.forEach(mk => {
    mk.row = mk.p - lastInRow[0] >= 13 ? 0 : (mk.p - lastInRow[1] >= 13 ? 1 : 0);
    lastInRow[mk.row] = mk.p;
  });
  const rows = marks.some(mk => mk.row === 1) ? 2 : 1;

  const lines = marks.filter(mk => mk.line)
    .map(mk => `<div class="axis-mark ${mk.cls}" style="left: ${mk.p}%;"></div>`).join('');
  const labels = marks.map(mk =>
    `<div class="axis-label ${mk.cls} ${edgeClass(mk.p)}" style="left: ${mk.p}%; top: ${mk.row * 38}px;"><b>${mk.time}</b><span>${mk.text}</span></div>`
  ).join('');

  const ticks = [];
  for (let h = lo; h <= hi; h += 2) ticks.push(`<span>${pad2(h)}</span>`);

  el.innerHTML = `
    <div class="axis-now-row"><div class="axis-now ${edgeClass(nowP)}" style="left: ${nowP}%;">teraz ${hhmm(now)}</div></div>
    <div class="axis-track">${blocks}${plan}${lines}<div class="axis-line" style="left: ${nowP}%;"></div></div>
    <div class="axis-labels" style="height: ${rows * 38}px;">${labels}</div>
    <div class="axis-ticks">${ticks.join('')}</div>`;
}

function renderRecentDays(st) {
  const el = document.getElementById('recent-days');
  if (!el) return;

  const rows = recentDays.map(d => ({
    date: d.date, seconds: d.seconds, norm: isNonWorkingDay(d.date) ? 0 : defaultTargetSeconds, live: false
  }));
  if (st.firstIn) rows.push({ date: localDateString(st.now), seconds: st.worked, norm: st.norm, live: true });

  if (rows.length === 0) {
    el.innerHTML = '<p class="axis-empty">Brak wcześniejszych dni z pracą.</p>';
    return;
  }

  const scale = Math.max(10 * 3600, defaultTargetSeconds * 1.25, ...rows.map(r => r.seconds));
  el.innerHTML = rows.map(r => {
    const [y, m, d] = r.date.split('-').map(Number);
    const wd = WEEKDAYS_SHORT[new Date(y, m - 1, d).getDay()];
    const bal = r.seconds - r.norm;
    const running = r.live && st.hasOpen;
    const balText = running ? 'trwa' : formatHM(bal, true);
    const balColor = running ? 'var(--text-muted)' : (bal >= 0 ? 'var(--positive)' : 'var(--negative)');
    const normMark = r.norm > 0 ? `<div class="recent-norm" style="left: ${r.norm / scale * 100}%;"></div>` : '';
    return `<div class="recent-row">
      <span class="recent-day"><b>${wd}</b> ${d}.${pad2(m)}</span>
      <div class="recent-bar"><div class="recent-fill ${running ? 'live' : ''}" style="width: ${Math.min(100, r.seconds / scale * 100)}%;"></div>${normMark}</div>
      <span class="recent-val">${formatHM(r.seconds)}</span>
      <span class="recent-bal" style="color: ${balColor};">${balText}</span>
    </div>`;
  }).join('');
}

// Dane do ekranu Dziś: dzisiejsze wpisy i ostatnie dni (zawsze zalogowany użytkownik, bieżący miesiąc;
// poprzedni miesiąc dociągany, gdy w bieżącym jest mniej niż 5 dni z pracą)
async function loadTodayData() {
  if (!currentUser) return;
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const today = localDateString(now);
  try {
    const [logs, target] = await Promise.all([
      invoke('get_logs', { userId: Number(currentUser.id), year: y, month: m }),
      invoke('get_daily_target_seconds')
    ]);
    defaultTargetSeconds = Number(target) || 28800;
    let all = logs || [];
    const pastDates = new Set(all.filter(l => l.date < today).map(l => l.date));
    if (pastDates.size < 5) {
      const prev = await invoke('get_logs', {
        userId: Number(currentUser.id), year: m === 1 ? y - 1 : y, month: m === 1 ? 12 : m - 1
      });
      all = all.concat(prev || []);
    }

    todayLogs = all.filter(l => l.date === today).sort((a, b) => a.time_in.localeCompare(b.time_in));

    const totals = {};
    all.forEach(l => {
      if (l.date < today && (l.event_type === 'work' || l.event_type === 'business') && l.duration_seconds) {
        totals[l.date] = (totals[l.date] || 0) + l.duration_seconds;
      }
    });
    recentDays = Object.keys(totals).sort().slice(-5).map(date => ({ date, seconds: totals[date] }));
  } catch (err) {
    console.error('Błąd ładowania danych dnia:', err);
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
    renderTodayHeader();
    if (currentUser) updateUI();
  }

  if (currentStats) {
    renderToday();
    renderLeaveTime();
    renderBalance();
  }
}, 1000);

// Zamyka sesje zapomniane w poprzednich dniach (o 22:00) i pokazuje monit
async function closeForgottenSessions() {
  if (!currentUser) return;
  try {
    const closedDates = await invoke('close_forgotten_sessions', { userId: currentUser.id });
    if (closedDates && closedDates.length > 0) {
      const msg = `Zapomniano zamknąć sesję (${closedDates.join(', ')}). ` +
        `Zamknięto ją automatycznie o 22:00 – popraw godzinę wyjścia w zakładce Miesiąc.`;
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
  const activeUserId = viewedUserId(); // tylko dla Raportów

  await closeForgottenSessions();
  renderTodayHeader();

  try {
    // Dashboard ZAWSZE liczy bieżący miesiąc i ZAWSZE zalogowanego użytkownika
    // (niezależnie od filtra miesiąca i wybranego pracownika w Raportach)
    const now = new Date();
    const stats = await invoke('get_dashboard_stats', {
      userId: Number(currentUser.id),
      year: now.getFullYear(),
      month: now.getMonth() + 1
    });

    // Zapisujemy odebrany obiekt do zmiennej globalnej
    currentStats = stats;

    // Ekran Dziś: dzisiejsze wpisy + ostatnie dni, potem liczniki i oś dnia
    await loadTodayData();
    renderToday(true);

    // Powiadomienia "na zero" / "pełny dzień"
    renderLeaveTime();

    // Saldo miesięczne (po przekroczeniu normy dnia liczone na żywo – patrz renderBalance)
    renderBalance();

    // 2. Pobieranie logów z wybranego miesiąca dla wybranego użytkownika
    const logs = await invoke('get_logs', { 
      userId: Number(activeUserId),
      year: Number(selectedYear),
      month: Number(selectedMonth) // <-- rzutujemy na Number!
    });
    
    tableBody.innerHTML = logs.length === 0
      ? `<tr><td colspan="6" class="muted" style="text-align: center;">Brak wpisów w tym miesiącu.</td></tr>`
      : logs.map(log => `
      <tr class="row-${log.event_type}">
        <td>${formatDayLabel(log.date)}</td>
        <td class="num">${timePart(log.time_in)}</td>
        <td class="num">${log.time_out ? timePart(log.time_out) : '<span class="chip chip-open">trwa</span>'}</td>
        <td class="num"><b>${log.duration_seconds !== null ? formatSeconds(log.duration_seconds, false) : '—'}</b></td>
        <td><span class="chip chip-${log.event_type}">${eventLabels[log.event_type] || log.event_type}</span></td>
        <td class="actions">
          <button class="icon-btn icon-btn-plain" title="Edytuj wpis" aria-label="Edytuj wpis" onclick="openEditModal(${log.id}, '${log.date}', '${log.time_in}', '${log.time_out || ''}', '${log.event_type}')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>
          </button>
          <button class="icon-btn icon-btn-plain icon-btn-danger" title="Usuń wpis" aria-label="Usuń wpis" onclick="deleteLogEntry(${log.id})">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path></svg>
          </button>
        </td>
      </tr>
    `).join('');

    renderChart(logs);

    // Przyciskami RCP steruje tylko aktualnie zalogowany użytkownik na swoje konto.
    // Stan przycisków = dzisiejsza otwarta sesja (niezależnie od filtra w Raportach)
    const activeLog = await invoke('get_active_session', { userId: currentUser.id });

    // Niedostępne (disabled) przyciski są ukrywane przez CSS (.act:disabled),
    // więc widać tylko akcje, które mają sens w danej chwili.
    if (!activeLog) {
      btnStart.disabled = false;
      btnStop.disabled = true;
      btnPrivate.disabled = true;
      btnBusiness.disabled = true;
      btnPrivate.style.display = 'inline-flex';
      btnBusiness.style.display = 'inline-flex';
      btnReturn.style.display = 'none';
    } else if (activeLog.event_type === 'work') {
      btnStart.disabled = true;
      btnStop.disabled = false;
      btnPrivate.disabled = false;
      btnBusiness.disabled = false;
      btnPrivate.style.display = 'inline-flex';
      btnBusiness.style.display = 'inline-flex';
      btnReturn.style.display = 'none';
    } else {
      btnStart.disabled = true;
      btnStop.disabled = true;
      btnPrivate.style.display = 'none';
      btnBusiness.style.display = 'none';
      btnReturn.style.display = 'inline-flex';
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
      absencesTableBody.innerHTML = list.length === 0
        ? `<tr><td colspan="3" class="muted" style="text-align: center;">Brak zarejestrowanych nieobecności.</td></tr>`
        : list.map(item => `
        <tr>
          <td>${formatDayLabel(item.date)} <span class="muted">${item.date.slice(0, 4)}</span></td>
          <td><span class="chip chip-${item.absence_type}">${absenceLabels[item.absence_type] || item.absence_type}</span></td>
          <td class="actions">
            <button class="icon-btn icon-btn-plain icon-btn-danger" title="Usuń nieobecność" aria-label="Usuń nieobecność" onclick="deleteAbsenceEntry(${item.id})">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path></svg>
            </button>
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
        absenceMsg.style.color = "var(--accent)";
        absenceMsg.textContent = res;
      }
      await loadAbsences();
    } catch (err) {
      if (absenceMsg) {
        absenceMsg.style.color = "var(--negative)";
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

// Strzałki poprzedni / następny miesiąc (zakres lat jak w liście: 2024–2030)
function shiftMonth(delta) {
  let m = selectedMonth + delta;
  let y = selectedYear;
  if (m < 1) { m = 12; y -= 1; }
  if (m > 12) { m = 1; y += 1; }
  if (y < 2024 || y > 2030) return;
  selectedMonth = m;
  selectedYear = y;
  initDateSelectors();
  updateUI();
}

const btnMonthPrev = document.getElementById('btn-month-prev');
const btnMonthNext = document.getElementById('btn-month-next');
if (btnMonthPrev) btnMonthPrev.addEventListener('click', () => shiftMonth(-1));
if (btnMonthNext) btnMonthNext.addEventListener('click', () => shiftMonth(1));

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
    chartContainer.innerHTML = '<p class="chart-empty">Brak danych do wyświetlenia wykresu dla tego miesiąca.</p>';
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

    // Etap 1 redesignu: tylko nowe kolory; schemat 4 stanów (saldo narastająco) – etap 3
    barWrapper.innerHTML = `
      <span style="font-size: 10px; color: var(--text-muted); margin-bottom: 4px; font-family: var(--mono);">${hours.toFixed(1).replace('.', ',')}</span>
      <div style="width: 100%; max-width: 22px; height: ${heightPx}px; background: ${hours >= 8 ? 'var(--accent)' : 'var(--accent-soft)'}; border-radius: 4px 4px 1px 1px;"></div>
      <span style="font-size: 11px; font-weight: 600; margin-top: 4px; font-family: var(--mono);">${dayNum}</span>
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
    createUserMsg.style.color = "var(--accent)";
    createUserMsg.textContent = msg;
    newUsername.value = "";
    newPassword.value = "";
  } catch (err) {
    createUserMsg.style.color = "var(--negative)";
    createUserMsg.textContent = err;
  }
});

// Modale i Formularze
window.openEditModal = (id, date, timeIn, timeOut, eventType) => {
  dialogTitle.textContent = "Edytuj wpis";
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
  dialogTitle.textContent = "Nowy wpis";
  editId.value = "";
  editDate.value = localDateString(); // lokalna data (toISOString daje UTC → po północy "wczoraj")
  editTimeIn.value = "08:00:00";
  editTimeOut.value = "16:00:00";
  editEventType.value = "work";
  editDialog.showModal();
});

btnDialogCancel.addEventListener('click', () => editDialog.close());
const btnDialogClose = document.getElementById('btn-dialog-close');
if (btnDialogClose) btnDialogClose.addEventListener('click', () => editDialog.close());

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
        userId: viewedUserId(), // wpis trafia do użytkownika oglądanego w Raportach
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
    const csvContent = await invoke('export_csv_data', { userId: viewedUserId() });

    // Pobranie pliku przez przeglądarkę
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `rcp_export_${viewedUserName()}_${localDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    csvMsg.style.color = "var(--accent)";
    csvMsg.textContent = "Wygenerowano plik CSV!";
  } catch (err) {
    csvMsg.style.color = "var(--negative)";
    csvMsg.textContent = "Błąd eksportu: " + err;
  }
});

// Obsługa Importu CSV
document.getElementById('input-import-csv').addEventListener('change', (e) => {
  const file = e.target.files[0];
  const csvMsg = document.getElementById('csv-msg');
  if (!file) return;

  // Import do cudzego konta – upewnij się, że to zamierzone
  if (isViewingOtherUser() &&
      !confirm(`Zaimportować dane do konta "${viewedUserName()}"?`)) {
    e.target.value = '';
    return;
  }
  const importUserId = viewedUserId();

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const content = event.target.result;
      const res = await invoke('import_csv_data', {
        userId: importUserId,
        csvContent: content
      });
      // Zielony = wszystko OK, pomarańczowy = część wierszy odrzucona
      csvMsg.style.color = res.includes("Błędne wiersze") ? "var(--private)" : "var(--accent)";
      csvMsg.textContent = res;
      await updateUI();
    } catch (err) {
      csvMsg.style.color = "var(--negative)";
      csvMsg.textContent = "Błąd importu: " + err;
    }
  };
  reader.readAsText(file);
  // Reset pola, żeby ponowny wybór tego samego pliku też wywołał import
  e.target.value = '';
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
 * Konwertuje sekundy na format zegarowy "G:MM:SS" (redesign: zamiast "Xh Ym Zs")
 * @param {number} totalSeconds - Liczba sekund
 * @param {boolean} showPlus - Czy pokazywać znak '+' przy dodatnich wartościach (dla salda)
 */
function formatSeconds(totalSeconds, showPlus = false) {
  if (totalSeconds === null || totalSeconds === undefined || isNaN(totalSeconds)) {
    return '0:00:00';
  }

  const isNegative = totalSeconds < 0;
  const absSeconds = Math.abs(Math.round(totalSeconds));

  const hours = Math.floor(absSeconds / 3600);
  const minutes = Math.floor((absSeconds % 3600) / 60);
  const seconds = absSeconds % 60;

  const result = `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  if (isNegative) {
    return `−${result}`; // typograficzny minus
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