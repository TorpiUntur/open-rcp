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
    pub duration_seconds: Option<i64>,
    pub event_type: String,
}

#[derive(Serialize)]
pub struct DashboardStats {
    pub today_first_in: Option<String>,
    pub target_leave_time: String,
    pub monthly_balance_seconds: i64,     // W sekundach
    pub today_private_break_seconds: i64, // W sekundach
    pub daily_target_seconds: i64,        // W sekundach
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

    let row = stmt.query_row(rusqlite::params![user_id, date], |r| Ok((r.get::<_, i32>(0)?, r.get::<_, String>(1)?)));

    if let Ok((id, time_in)) = row {
        let duration = crate::time_calc::calculate_duration_seconds(&time_in, now);

        db.execute(
            "UPDATE time_log SET time_out = ?, duration_seconds = ? WHERE id = ?",
            rusqlite::params![now, duration, id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Brak aktywnej sesji!".into())
    }
}

#[tauri::command]
pub fn get_logs(user_id: i32, state: tauri::State<AppState>) -> Result<Vec<TimeLog>, String> {
    let db = state.db.lock().map_err(|_| "Błąd blokady bazy danych")?;
    
    // ZMIANA: Pobieramy duration_seconds zamiast duration_minutes
    let mut stmt = db.prepare(
        "SELECT id, user_id, date, time_in, time_out, duration_seconds, event_type 
         FROM time_log WHERE user_id = ? ORDER BY id DESC"
    ).map_err(|e| e.to_string())?;

    let logs = stmt.query_map([user_id], |row| {
        Ok(TimeLog {
            id: row.get(0)?,
            user_id: row.get(1)?,
            date: row.get(2)?,
            time_in: row.get(3)?,
            time_out: row.get(4)?,
            duration_seconds: row.get(5)?, // Przypisujemy prawidłowo sekundy
            event_type: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(logs)
}

#[tauri::command]
pub fn get_dashboard_stats(user_id: i32, state: tauri::State<AppState>) -> Result<DashboardStats, String> {
    let db = state.db.lock().map_err(|_| "Błąd bazy")?;
    let today = crate::time_calc::current_date();
    let month_start = crate::time_calc::current_month_start();

    // 1. Norma dzienna w SEKUNDACH (domyślnie 8h = 28800 s)
    let daily_target_seconds: i64 = db.query_row(
        "SELECT value FROM settings WHERE key = 'daily_target_seconds'",
        [],
        |r| r.get::<_, String>(0),
    ).unwrap_or_else(|_| "28800".to_string()).parse().unwrap_or(28800);

    // 2. Pierwsze wejście dzisiaj
    let today_first_in: Option<String> = db.query_row(
        "SELECT time_in FROM time_log WHERE user_id = ? AND date = ? ORDER BY id ASC LIMIT 1",
        rusqlite::params![user_id, today],
        |r| r.get(0),
    ).ok();

    // 3. Łączny czas przerw prywatnych dzisiaj (w sekundach)
    let today_private_break_seconds: i64 = db.query_row(
        "SELECT COALESCE(SUM(duration_seconds), 0) FROM time_log 
         WHERE user_id = ? AND date = ? AND event_type = 'break_private'",
        rusqlite::params![user_id, today],
        |r| r.get(0),
    ).unwrap_or(0);

    // 4. Saldo z poprzednich dni miesiąca (w sekundach)
    let mut stmt = db.prepare(
        "SELECT date, SUM(duration_seconds) FROM time_log 
         WHERE user_id = ? AND date >= ? AND date < ? AND event_type IN ('work', 'business') AND duration_seconds IS NOT NULL
         GROUP BY date"
    ).map_err(|e| e.to_string())?;

    let daily_totals = stmt.query_map(rusqlite::params![user_id, month_start, today], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    }).map_err(|e| e.to_string())?;

    let mut previous_days_balance_seconds: i64 = 0;
    for day in daily_totals.filter_map(|r| r.ok()) {
        previous_days_balance_seconds += day.1 - daily_target_seconds;
    }

    // 5. Godzina wyjścia na zero
    let target_leave_time = if let Some(ref first_in) = today_first_in {
        crate::time_calc::calculate_target_leave_time(
            first_in,
            daily_target_seconds,
            previous_days_balance_seconds,
            today_private_break_seconds,
        )
    } else {
        "---".to_string()
    };

    Ok(DashboardStats {
        today_first_in,
        target_leave_time,
        monthly_balance_seconds: previous_days_balance_seconds,
        today_private_break_seconds,
        daily_target_seconds,
    })
}

// ==========================================
// 3. EDYCJA RETROAKTYWNA I RAPORTY (KROK 4)
// ==========================================

// Ręczne dodanie wpisu (retroaktywnie)
#[tauri::command]
pub fn add_manual_log(
    user_id: i32,
    date: String,
    time_in: String,
    time_out: Option<String>,
    event_type: String,
    state: tauri::State<AppState>,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "Błąd bazy")?;

    let full_time_in = format!("{} {}", date, time_in);
    let full_time_out = time_out.as_ref().map(|t| format!("{} {}", date, t));

    let duration_seconds = if let Some(ref out_time) = full_time_out {
        Some(crate::time_calc::calculate_duration_seconds(&full_time_in, out_time))
    } else {
        None
    };

    db.execute(
        "INSERT INTO time_log (user_id, date, time_in, time_out, duration_seconds, event_type) 
         VALUES (?, ?, ?, ?, ?, ?)",
        rusqlite::params![user_id, date, full_time_in, full_time_out, duration_seconds, event_type],
    ).map_err(|e| format!("Błąd dodawania wpisu: {}", e))?;

    Ok("Pomyślnie dodano nowy wpis".into())
}

// Modyfikacja istniejącego wpisu
#[tauri::command]
pub fn update_log(
    log_id: i32,
    date: String,
    time_in: String,
    time_out: Option<String>,
    event_type: String,
    state: tauri::State<AppState>,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "Błąd bazy")?;

    let full_time_in = format!("{} {}", date, time_in);
    let full_time_out = time_out.as_ref().filter(|t| !t.is_empty()).map(|t| format!("{} {}", date, t));

    let duration_seconds = if let Some(ref out_time) = full_time_out {
        Some(crate::time_calc::calculate_duration_seconds(&full_time_in, out_time))
    } else {
        None
    };

    db.execute(
        "UPDATE time_log SET date = ?, time_in = ?, time_out = ?, duration_seconds = ?, event_type = ? 
         WHERE id = ?",
        rusqlite::params![date, full_time_in, full_time_out, duration_seconds, event_type, log_id],
    ).map_err(|e| format!("Błąd edycji wpisu: {}", e))?;

    Ok("Wpis został zaktualizowany".into())
}

// Usuwanie wpisu
#[tauri::command]
pub fn delete_log(log_id: i32, state: tauri::State<AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "Błąd bazy")?;

    db.execute("DELETE FROM time_log WHERE id = ?", [log_id])
        .map_err(|e| format!("Błąd usuwania: {}", e))?;

    Ok("Usunięto wpis".into())
}