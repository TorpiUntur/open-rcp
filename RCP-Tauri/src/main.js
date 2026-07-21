const { invoke } = window.__TAURI__.core;

const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnBreak = document.getElementById('btn-break');
const statusMsg = document.getElementById('status-msg');
const tableBody = document.getElementById('logs-table-body');

// 1. Funkcja odświeżająca tabelę
async function renderLogs() {
  try {
    const logs = await invoke('get_logs');
    
    tableBody.innerHTML = logs.map(log => `
      <tr class="${log.is_break ? 'row-break' : ''}">
        <td>${log.id}</td>
        <td>${log.date}</td>
        <td>${log.time_in.split(' ')[1] || log.time_in}</td>
        <td>${log.time_out ? (log.time_out.split(' ')[1] || log.time_out) : '---'}</td>
        <td>${log.duration_minutes !== null ? log.duration_minutes + ' min' : 'W trakcie...'}</td>
        <td>${log.is_break ? 'Przerwa' : 'Praca'}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error("Błąd pobierania danych:", err);
  }
}

// 2. Obsługa przycisków
btnStart.addEventListener('click', async () => {
  try {
    const msg = await invoke('clock_in', { eventType: 'work' });
    statusMsg.textContent = msg;
    await renderLogs();
  } catch (err) {
    statusMsg.textContent = "Błąd: " + err;
  }
});

btnBreak.addEventListener('click', async () => {
  try {
    const msg = await invoke('clock_in', { eventType: 'break' });
    statusMsg.textContent = msg;
    await renderLogs();
  } catch (err) {
    statusMsg.textContent = "Błąd: " + err;
  }
});

btnStop.addEventListener('click', async () => {
  try {
    const msg = await invoke('clock_out');
    statusMsg.textContent = msg;
    await renderLogs();
  } catch (err) {
    statusMsg.textContent = "Błąd: " + err;
  }
});

// Pierwsze załadowanie tabeli na starcie aplikacji
renderLogs();