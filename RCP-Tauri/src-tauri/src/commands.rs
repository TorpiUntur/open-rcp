use crate::AppState;
use serde::Serialize;
use rusqlite::params;

#[derive(Serialize)]
pub struct User {
    pub id: i32,
    pub username: String,
    pub role: String,
}

#[derive(Serialize)]
pub struct TimeLog {
    pub id: i32,
    pub user_id: i32,
    pub date: String,
    pub time_in: String,
    pub time_out: Option<String>,
    pub duration_minutes: Option<i32>,
    pub event_type: String,
}

// ==========================================
// 1. SYSTEM AUTORYZACJI I SESJI (KROK 2)
// ==========================================

#[tauri::command]
pub fn check_auto_login(state: tauri::State<AppState>) -> Result<Option<User>, String> {
    let db = state.db.lock().map_err(|_| "Błąd blokady bazy danych")?;
    
    let active_user_id: Option<String> = db.query_row(
        "SELECT value FROM settings WHERE key = 'active_user_id'",
        [],
        |r| r.get(0),
    ).ok();

    if let Some(user_id_str) = active_user_id {
        if let Ok(user_id) = user_id_str.parse::<i32>() {
            let user = db.query_row(
                "SELECT id, username, role FROM users WHERE id = ?",
                [user_id],
                |r| Ok(User { id: r.get(0)?, username: r.get(1)?, role: r.get(2)? }),
            ).ok();
            return Ok(user);
        }
    }

    Ok(None)
}

#[tauri::command]
pub fn login(
    username: String, 
    password: String, 
    remember_me: bool, 
    state: tauri::State<AppState>
) -> Result<User, String> {
    let db = state.db.lock().map_err(|_| "Błąd blokady bazy danych")?;
    let pass_hash = format!("{:x}", md5::compute(password));

    let user = db.query_row(
        "SELECT id, username, role FROM users WHERE username = ? AND password_hash = ?",
        [&username, &pass_hash],
        |r| Ok(User { id: r.get(0)?, username: r.get(1)?, role: r.get(2)? }),
    ).map_err(|_| "Niepoprawny login lub hasło".to_string())?;

    if remember_me {
        let _ = db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('active_user_id', ?)",
            [&user.id.to_string()],
        );
    } else {
        let _ = db.execute("DELETE FROM settings WHERE key = 'active_user_id'", []);
    }

    Ok(user)
}

#[tauri::command]
pub fn logout(state: tauri::State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "Błąd blokady bazy danych")?;
    let _ = db.execute("DELETE FROM settings WHERE key = 'active_user_id'", []);
    Ok(())
}

#[tauri::command]
pub fn create_user(
    username: String, 
    password: String, 
    role: String, 
    state: tauri::State<AppState>
) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "Błąd blokady bazy danych")?;
    let pass_hash = format!("{:x}", md5::compute(password));

    db.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        [&username, &pass_hash, &role],
    ).map_err(|e| format!("Nie udało się utworzyć użytkownika: {}", e))?;

    Ok(format!("Utworzono użytkownika {}", username))
}

// ==========================================
// 2. LOGIKA REJESTRACJI CZASU (IZOLACJA PER USER)
// ==========================================

#[tauri::command]
pub fn clock_in(user_id: i32, event_type: String, state: tauri::State<AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "Błąd blokady bazy danych")?;
    let now = crate::time_calc::current_timestamp();
    let date = crate::time_calc::current_date();

    // Sprawdzamy aktywną sesję konkretnego użytkownika
    let active_event: Option<String> = db.query_row(
        "SELECT event_type FROM time_log WHERE user_id = ? AND date = ? AND time_out IS NULL ORDER BY id DESC LIMIT 1",
        params![user_id, date],
        |row| row.get(0),
    ).ok();

    if let Some(current) = active_event {
        if event_type == "work" {
            return Err("Sesja pracy już trwa!".into());
        }
        if current != "work" {
            return Err("Jesteś już na wyjściu! Najpierw zarejestruj powrót.".into());
        }
        let _ = clock_out_internal(&db, user_id, &date, &now);
    } else if event_type != "work" {
        return Err("Nie możesz zarejestrować wyjścia bez otwartej sesji pracy!".into());
    }

    db.execute(
        "INSERT INTO time_log (user_id, date, time_in, event_type) VALUES (?, ?, ?, ?)",
        params![user_id, date, now, event_type],
    ).map_err(|e| e.to_string())?;

    let msg = match event_type.as_str() {
        "work" => "Rozpoczęto pracę",
        "break_private" => "Rozpoczęto wyjście prywatne (pauza zegara)",
        "business" => "Rozpoczęto wyjście służbowe (czas zaliczany)",
        _ => "Zarejestrowano zdarzenie",
    };

    Ok(format!("{} o {}", msg, now))
}

#[tauri::command]
pub fn return_to_work(user_id: i32, state: tauri::State<AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "Błąd blokady bazy danych")?;
    let now = crate::time_calc::current_timestamp();
    let date = crate::time_calc::current_date();

    clock_out_internal(&db, user_id, &date, &now)?;

    db.execute(
        "INSERT INTO time_log (user_id, date, time_in, event_type) VALUES (?, ?, ?, 'work')",
        params![user_id, date, now],
    ).map_err(|e| e.to_string())?;

    Ok(format!("Zarejestrowano powrót do pracy o {}", now))
}

#[tauri::command]
pub fn clock_out(user_id: i32, state: tauri::State<AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "Błąd blokady bazy danych")?;
    let now = crate::time_calc::current_timestamp();
    let date = crate::time_calc::current_date();

    clock_out_internal(&db, user_id, &date, &now)?;
    Ok(format!("Zakończono pracę o {}", now))
}

fn clock_out_internal(db: &rusqlite::Connection, user_id: i32, date: &str, now: &str) -> Result<(), String> {
    let mut stmt = db.prepare(
        "SELECT id, time_in FROM time_log WHERE user_id = ? AND date = ? AND time_out IS NULL ORDER BY id DESC LIMIT 1"
    ).map_err(|e| e.to_string())?;

    let row = stmt.query_row(params![user_id, date], |r| Ok((r.get::<_, i32>(0)?, r.get::<_, String>(1)?)));

    if let Ok((id, time_in)) = row {
        // Obliczenie minut przez nasz moduł time_calc
        let duration = crate::time_calc::calculate_duration_minutes(&time_in, now);

        db.execute(
            "UPDATE time_log SET time_out = ?, duration_minutes = ? WHERE id = ?",
            params![now, duration, id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Brak aktywnej sesji!".into())
    }
}

#[tauri::command]
pub fn get_logs(user_id: i32, state: tauri::State<AppState>) -> Result<Vec<TimeLog>, String> {
    let db = state.db.lock().map_err(|_| "Błąd blokady bazy danych")?;
    let mut stmt = db.prepare(
        "SELECT id, user_id, date, time_in, time_out, duration_minutes, event_type 
         FROM time_log WHERE user_id = ? ORDER BY id DESC"
    ).map_err(|e| e.to_string())?;

    let logs = stmt.query_map([user_id], |row| {
        Ok(TimeLog {
            id: row.get(0)?,
            user_id: row.get(1)?,
            date: row.get(2)?,
            time_in: row.get(3)?,
            time_out: row.get(4)?,
            duration_minutes: row.get(5)?,
            event_type: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(logs)
}