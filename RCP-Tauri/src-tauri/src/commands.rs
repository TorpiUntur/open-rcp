use crate::AppState;
use serde::Serialize;
use chrono::Local;

#[derive(Serialize)]
pub struct TimeLog {
    pub id: i32,
    pub date: String,
    pub time_in: String,
    pub time_out: Option<String>,
    pub duration_minutes: Option<i32>,
    pub is_break: bool,
}

// Funkcja pomocnicza do pobierania aktualnego czasu
fn current_timestamp() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn current_date() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

// 1. Zdarzenie: START PRACY / PRZERWA
#[tauri::command]
pub fn clock_in(event_type: String, state: tauri::State<AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "Błąd blokady bazy danych")?;
    let now = current_timestamp();
    let date = current_date();

    // Sprawdzamy, czy użytkownik nie ma już otwartej sesji
    let open_rows: i32 = db.query_row(
        "SELECT COUNT(*) FROM time_log WHERE date = ? AND time_out IS NULL",
        [&date],
        |row| row.get(0),
    ).unwrap_or(0);

    if open_rows > 0 {
        return Err("Masz już aktywną sesję! Najpierw kliknij STOP.".into());
    }

    let is_break = if event_type == "break" { 1 } else { 0 };

    db.execute(
        "INSERT INTO time_log (date, time_in, is_break) VALUES (?, ?, ?)",
        [&date, &now, &is_break.to_string()],
    ).map_err(|e| e.to_string())?;

    Ok(format!("Zarejestrowano wejście ({}) o {}", event_type, now))
}

// 2. Zdarzenie: STOP PRACY
#[tauri::command]
pub fn clock_out(state: tauri::State<AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "Błąd blokady bazy danych")?;
    let now = current_timestamp();
    let date = current_date();

    // Pobieramy OSTATNI otwarty wpis (gdzie time_out IS NULL)
    let mut stmt = db.prepare(
        "SELECT id, time_in FROM time_log WHERE date = ? AND time_out IS NULL ORDER BY id DESC LIMIT 1"
    ).map_err(|e| e.to_string())?;

    let row = stmt.query_row([&date], |r| Ok((r.get::<_, i32>(0)?, r.get::<_, String>(1)?)));

    if let Ok((id, time_in)) = row {
        // Obliczamy różnicę w minutach
        let duration = if let (Ok(start), Ok(end)) = (
            chrono::NaiveDateTime::parse_from_str(&time_in, "%Y-%m-%d %H:%M:%S"),
            chrono::NaiveDateTime::parse_from_str(&now, "%Y-%m-%d %H:%M:%S"),
        ) {
            (end - start).num_minutes() as i32
        } else {
            0
        };

        db.execute(
            "UPDATE time_log SET time_out = ?, duration_minutes = ? WHERE id = ?",
            [&now, &duration.to_string(), &id.to_string()],
        ).map_err(|e| e.to_string())?;

        Ok(format!("Zapisano wyjście o {}. Czas trwania: {} min.", now, duration))
    } else {
        Err("Brak aktywnej sesji do zakończenia!".into())
    }
}

// 3. Pobieranie historii do tabeli
#[tauri::command]
pub fn get_logs(state: tauri::State<AppState>) -> Result<Vec<TimeLog>, String> {
    let db = state.db.lock().map_err(|_| "Błąd blokady bazy")?;
    let mut stmt = db.prepare(
        "SELECT id, date, time_in, time_out, duration_minutes, is_break FROM time_log ORDER BY id DESC"
    ).map_err(|e| e.to_string())?;

    let logs = stmt.query_map([], |row| {
        Ok(TimeLog {
            id: row.get(0)?,
            date: row.get(1)?,
            time_in: row.get(2)?,
            time_out: row.get(3)?,
            duration_minutes: row.get(4)?,
            is_break: row.get::<_, i32>(5)? == 1,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(logs)
}