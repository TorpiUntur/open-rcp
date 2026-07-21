const { invoke } = window.__TAURI__.core;

const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnPrivate = document.getElementById('btn-private');
const btnBusiness = document.getElementById('btn-business');
const btnReturn = document.getElementById('btn-return');

const statusMsg = document.getElementById('status-msg');
const tableBody = document.getElementById('logs-table-body');

const eventLabels = {
  'work': 'Praca przy biurku',
  'break_private': 'Wyjście prywatne (Przerwa)',
  'business': 'Wyjście służbowe (Delegacja)'
};

async function updateUI() {
  try {
    const logs = await invoke('get_logs');
    
    // Tabela
    tableBody.innerHTML = logs.map(log => `
      <tr class="row-${log.event_type}">
        <td>${log.id}</td>
        <td>${log.date}</td>
        <td>${log.time_in.split(' ')[1] || log.time_in}</td>
        <td>${log.time_out ? (log.time_out.split(' ')[1] || log.time_out) : 'W trakcie...'}</td>
        <td>${log.duration_minutes !== null ? log.duration_minutes + ' min' : '---'}</td>
        <td><b>${eventLabels[log.event_type] || log.event_type}</b></td>
      </tr>
    `).join('');

    // Zmiana stanów przycisków na podstawie OSTATNIEGO wpisu
    const activeLog = logs.length > 0 && !logs[0].time_out ? logs[0] : null;

    if (!activeLog) {
      // Brak aktywnej sesji
      btnStart.disabled = false;
      btnStop.disabled = true;
      btnPrivate.disabled = true;
      btnBusiness.disabled = true;
      
      btnPrivate.style.display = 'inline-block';
      btnBusiness.style.display = 'inline-block';
      btnReturn.style.display = 'none';
    } else if (activeLog.event_type === 'work') {
      // Trwa praca przy biurku
      btnStart.disabled = true;
      btnStop.disabled = false;
      btnPrivate.disabled = false;
      btnBusiness.disabled = false;

      btnPrivate.style.display = 'inline-block';
      btnBusiness.style.display = 'inline-block';
      btnReturn.style.display = 'none';
    } else {
      // Jesteśmy na wyjściu (prywatnym lub służbowym)
      btnStart.disabled = true;
      btnStop.disabled = true;

      // Ukrywamy przyciski wyjścia, pokazujemy Powrót!
      btnPrivate.style.display = 'none';
      btnBusiness.style.display = 'none';
      btnReturn.style.display = 'inline-block';
    }

  } catch (err) {
    console.error("Błąd UI:", err);
  }
}

// Obsługa kliknięć
btnStart.addEventListener('click', async () => {
  try {
    statusMsg.textContent = await invoke('clock_in', { eventType: 'work' });
    await updateUI();
  } catch (e) { statusMsg.textContent = e; }
});

btnPrivate.addEventListener('click', async () => {
  try {
    statusMsg.textContent = await invoke('clock_in', { eventType: 'break_private' });
    await updateUI();
  } catch (e) { statusMsg.textContent = e; }
});

btnBusiness.addEventListener('click', async () => {
  try {
    statusMsg.textContent = await invoke('clock_in', { eventType: 'business' });
    await updateUI();
  } catch (e) { statusMsg.textContent = e; }
});

btnReturn.addEventListener('click', async () => {
  try {
    statusMsg.textContent = await invoke('return_to_work');
    await updateUI();
  } catch (e) { statusMsg.textContent = e; }
});

btnStop.addEventListener('click', async () => {
  try {
    statusMsg.textContent = await invoke('clock_out');
    await updateUI();
  } catch (e) { statusMsg.textContent = e; }
});

// Pierwsze załadowanie
updateUI();