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
    pub event_type: String, // 'work', 'break_private', 'business'
}

fn current_timestamp() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn current_date() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

// 1. START PRACY / WYJŚCIE PRYWATNE / WYJŚCIE SŁUŻBOWE
#[tauri::command]
pub fn clock_in(event_type: String, state: tauri::State<AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "Błąd blokady bazy danych")?;
    let now = current_timestamp();
    let date = current_date();

    // Sprawdzamy aktywną sesję
    let active_event: Option<String> = db.query_row(
        "SELECT event_type FROM time_log WHERE date = ? AND time_out IS NULL ORDER BY id DESC LIMIT 1",
        [&date],
        |row| row.get(0),
    ).ok();

    if let Some(current) = active_event {
        if event_type == "work" {
            return Err("Sesja pracy już trwa!".into());
        }
        if current != "work" {
            return Err("Jesteś już na wyjściu! Najpierw zarejestruj powrót.".into());
        }
        // Jeśli jesteśmy na 'work' i klikamy wyjście (prywatne/służbowe):
        // Zamykamy obecną sesję pracy na czas wyjścia
        let _ = clock_out_internal(&db, &date, &now);
    } else if event_type != "work" {
        return Err("Nie możesz zarejestrować wyjścia bez otwartej sesji pracy!".into());
    }

    db.execute(
        "INSERT INTO time_log (date, time_in, event_type) VALUES (?, ?, ?)",
        [&date, &now, &event_type],
    ).map_err(|e| e.to_string())?;

    let msg = match event_type.as_str() {
        "work" => "Rozpoczęto pracę",
        "break_private" => "Rozpoczęto wyjście prywatne (pauza zegara)",
        "business" => "Rozpoczęto wyjście służbowe (czas zaliczany)",
        _ => "Zarejestrowano zdarzenie",
    };

    Ok(format!("{} o {}", msg, now))
}

// 2. POWRÓT Z WYJŚCIA (Prywatnego lub Służbowego)
#[tauri::command]
pub fn return_to_work(state: tauri::State<AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "Błąd blokady bazy danych")?;
    let now = current_timestamp();
    let date = current_date();

    // Zamykamy wpis wyjścia prywatnego lub służbowego
    clock_out_internal(&db, &date, &now)?;

    // Automatycznie wznawiamy sesję pracy ('work')
    db.execute(
        "INSERT INTO time_log (date, time_in, event_type) VALUES (?, ?, 'work')",
        [&date, &now],
    ).map_err(|e| e.to_string())?;

    Ok(format!("Zarejestrowano powrót do pracy o {}", now))
}

// 3. STOP PRACY (Kończy całą dniówkę)
#[tauri::command]
pub fn clock_out(state: tauri::State<AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "Błąd blokady bazy danych")?;
    let now = current_timestamp();
    let date = current_date();

    clock_out_internal(&db, &date, &now)?;
    Ok(format!("Zakończono pracę o {}", now))
}

// Funkcja pomocnicza do zamykania aktywnej sesji w DB
fn clock_out_internal(db: &rusqlite::Connection, date: &str, now: &str) -> Result<(), String> {
    let mut stmt = db.prepare(
        "SELECT id, time_in FROM time_log WHERE date = ? AND time_out IS NULL ORDER BY id DESC LIMIT 1"
    ).map_err(|e| e.to_string())?;

    let row = stmt.query_row([date], |r| Ok((r.get::<_, i32>(0)?, r.get::<_, String>(1)?)));

    if let Ok((id, time_in)) = row {
        let duration = if let (Ok(start), Ok(end)) = (
            chrono::NaiveDateTime::parse_from_str(&time_in, "%Y-%m-%d %H:%M:%S"),
            chrono::NaiveDateTime::parse_from_str(now, "%Y-%m-%d %H:%M:%S"),
        ) {
            (end - start).num_minutes() as i32
        } else {
            0
        };

        db.execute(
            "UPDATE time_log SET time_out = ?, duration_minutes = ? WHERE id = ?",
            [now, &duration.to_string(), &id.to_string()],
        ).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Brak aktywnej sesji!".into())
    }
}

// 4. Pobieranie danych + Stan Aktualny dla UI
#[tauri::command]
pub fn get_logs(state: tauri::State<AppState>) -> Result<Vec<TimeLog>, String> {
    let db = state.db.lock().map_err(|_| "Błąd blokady bazy")?;
    let mut stmt = db.prepare(
        "SELECT id, date, time_in, time_out, duration_minutes, event_type FROM time_log ORDER BY id DESC"
    ).map_err(|e| e.to_string())?;

    let logs = stmt.query_map([], |row| {
        Ok(TimeLog {
            id: row.get(0)?,
            date: row.get(1)?,
            time_in: row.get(2)?,
            time_out: row.get(3)?,
            duration_minutes: row.get(4)?,
            event_type: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(logs)
}