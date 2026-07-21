const { invoke } = window.__TAURI__.core;

console.log("main.js załadowany poprawnie!");

const saveBtn = document.getElementById('save-btn');
const dateInput = document.getElementById('date-input');
const statusMsg = document.getElementById('status-msg');

async function logTime(){
  await invoke('add_log', { date: '2026-07-09'})
}

document.getElementById('save-btn').addEventListener('click', () => {
    console.log("Przycisk został wykryty!");
});

saveBtn.addEventListener('click', async (event) => {
  event.preventDefault(); // Zapobiega przeładowaniu strony przez przeglądarkę
  
  const dateValue = dateInput.value || "2026-07-21";
  console.log("Wysyłam do Rust date:", dateValue);

  try {
    const response = await invoke('add_log', { date: dateValue });
    console.log("Odpowiedź z Rust:", response);
    statusMsg.textContent = "Zapisano w bazie: " + dateValue;
  } catch (err) {
    console.error("Błąd wywołania IPC:", err);
    statusMsg.textContent = "Błąd: " + err;
  }
});

async function handleAddLog(){
  try{
    const response = await invoke('add_log', { date: "2026-07-09"});
    console.log(response);
    alert("log saved successfully");
  }catch(err){
    console.error("Database error:", err);
  }
}