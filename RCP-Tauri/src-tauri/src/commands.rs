use crate::AppState;
use rusqlite::{params, OptionalExtension};
use serde::Serialize;

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
    pub standard_leave_time: String,
    pub monthly_balance_seconds: i64,     // W sekundach
    pub today_private_break_seconds: i64, // W sekundach
    pub daily_target_seconds: i64,        // W sekundach
}

#[derive(Serialize)]
pub struct AbsenceLog {
    pub id: i32,
    pub user_id: i32,
    pub date: String,
    pub absence_type: String,
}

// ==========================================
// 1. SYSTEM AUTORYZACJI I SESJI (KROK 2)
// ==========================================

#[tauri::command]
pub fn check_auto_login(state: tauri::State<AppState>) -> Result<Option<User>, String> {
    let db = state.db.lock().map_err(|_| "Błąd blokady bazy danych")?;

    let active_user_id: Option<String> = db
        .query_row(
            "SELECT value FROM settings WHERE key = 'active_user_id'",
            [],
            |r| r.get(0),
        )
        .ok();

    if let Some(user_id_str) = active_user_id {
        if let Ok(user_id) = user_id_str.parse::<i32>() {
            let user = db
                .query_row(
                    "SELECT id, username, role FROM users WHERE id = ?",
                    [user_id],
                    |r| {
                        Ok(User {
                            id: r.get(0)?,
                            username: r.get(1)?,
                            role: r.get(2)?,
                        })
                    },
                )
                .ok();
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
    state: tauri::State<AppState>,
) -> Result<User, String> {
    let db = state.db.lock().map_err(|_| "Błąd blokady bazy danych")?;
    let pass_hash = format!("{:x}", md5::compute(password));

    let user = db
        .query_row(
            "SELECT id, username, role FROM users WHERE username = ? AND password_hash = ?",
            [&username, &pass_hash],
            |r| {
                Ok(User {
                    id: r.get(0)?,
                    username: r.get(1)?,
                    role: r.get(2)?,
                })
            },
        )
        .map_err(|_| "Niepoprawny login lub hasło".to_string())?;

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
    state: tauri::State<AppState>,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "Błąd blokady bazy danych")?;
    let pass_hash = format!("{:x}", md5::compute(password));

    db.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        [&username, &pass_hash, &role],
    )
    .map_err(|e| format!("Nie udało się utworzyć użytkownika: {}", e))?;

    Ok(format!("Utworzono użytkownika {}", username))
}

// ==========================================
// 2. LOGIKA REJESTRACJI CZASU (IZOLACJA PER USER)
// ==========================================

#[tauri::command]
pub fn clock_in(
    user_id: i32,
    event_type: String,
    state: tauri::State<AppState>,
) -> Result<String, String> {
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
    )
    .map_err(|e| e.to_string())?;

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
    )
    .map_err(|e| e.to_string())?;

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

fn clock_out_internal(
    db: &rusqlite::Connection,
    user_id: i32,
    date: &str,
    now: &str,
) -> Result<(), String> {
    let mut stmt = db.prepare(
        "SELECT id, time_in FROM time_log WHERE user_id = ? AND date = ? AND time_out IS NULL ORDER BY id DESC LIMIT 1"
    ).map_err(|e| e.to_string())?;

    let row = stmt.query_row(rusqlite::params![user_id, date], |r| {
        Ok((r.get::<_, i32>(0)?, r.get::<_, String>(1)?))
    });

    if let Ok((id, time_in)) = row {
        let duration = crate::time_calc::calculate_duration_seconds(&time_in, now);

        db.execute(
            "UPDATE time_log SET time_out = ?, duration_seconds = ? WHERE id = ?",
            rusqlite::params![now, duration, id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Brak aktywnej sesji!".into())
    }
}

/// Zwraca dzisiejszą otwartą sesję użytkownika (praca / wyjście) albo None.
/// Na tej podstawie frontend ustawia stan przycisków RCP.
#[tauri::command]
pub fn get_active_session(
    user_id: i32,
    state: tauri::State<AppState>,
) -> Result<Option<TimeLog>, String> {
    let db = state.db.lock().map_err(|_| "Błąd blokady bazy danych")?;
    let today = crate::time_calc::current_date();

    db.query_row(
        "SELECT id, user_id, date, time_in, time_out, duration_seconds, event_type
         FROM time_log
         WHERE user_id = ? AND date = ? AND time_out IS NULL
         ORDER BY id DESC LIMIT 1",
        params![user_id, today],
        |row| {
            Ok(TimeLog {
                id: row.get(0)?,
                user_id: row.get(1)?,
                date: row.get(2)?,
                time_in: row.get(3)?,
                time_out: row.get(4)?,
                duration_seconds: row.get(5)?,
                event_type: row.get(6)?,
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

// Godzina, o której automatycznie zamykamy sesję zapomnianą poprzedniego dnia
const FORGOTTEN_SESSION_CLOSE_TIME: &str = "22:00:00";

/// Zamyka wszystkie otwarte sesje użytkownika z dni wcześniejszych niż dziś
/// (zapomniany Stop). Sesja dostaje wyjście o 22:00 tego samego dnia
/// (lub równe wejściu, jeśli zaczęła się po 22:00).
/// Zwraca listę dat, w których coś zamknięto – frontend pokazuje monit.
#[tauri::command]
pub fn close_forgotten_sessions(
    user_id: i32,
    state: tauri::State<AppState>,
) -> Result<Vec<String>, String> {
    let db = state.db.lock().map_err(|_| "Błąd blokady bazy danych")?;
    let today = crate::time_calc::current_date();

    let open_sessions: Vec<(i32, String, String)> = {
        let mut stmt = db
            .prepare(
                "SELECT id, date, time_in FROM time_log
                 WHERE user_id = ? AND date < ? AND time_out IS NULL
                 ORDER BY date ASC, id ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows: Vec<(i32, String, String)> = stmt
            .query_map(rusqlite::params![user_id, today], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        rows
    };

    let mut closed_dates: Vec<String> = Vec::new();

    for (id, date, time_in) in open_sessions {
        let mut time_out = format!("{} {}", date, FORGOTTEN_SESSION_CLOSE_TIME);
        // Format "YYYY-MM-DD HH:MM:SS" sortuje się poprawnie jako tekst
        if time_in > time_out {
            time_out = time_in.clone();
        }
        let duration = crate::time_calc::calculate_duration_seconds(&time_in, &time_out);

        db.execute(
            "UPDATE time_log SET time_out = ?, duration_seconds = ? WHERE id = ?",
            rusqlite::params![time_out, duration, id],
        )
        .map_err(|e| e.to_string())?;

        if !closed_dates.contains(&date) {
            closed_dates.push(date);
        }
    }

    Ok(closed_dates)
}

// ZMIANA: Pobieranie logów przefiltrowanych po Roku i Miesiącu (np. year = 2026, month = 7)
#[tauri::command]
pub fn get_logs(
    user_id: i32,
    year: i32,
    month: i32,
    state: tauri::State<AppState>,
) -> Result<Vec<TimeLog>, String> {
    let db = state.db.lock().map_err(|_| "Błąd blokady bazy danych")?;

    let month_pattern = format!("{:04}-{:02}-%", year, month);

    let mut stmt = db
        .prepare(
            "SELECT id, user_id, date, time_in, time_out, duration_seconds, event_type 
         FROM time_log 
         WHERE user_id = ? AND date LIKE ? 
         ORDER BY date DESC, time_in DESC",
        )
        .map_err(|e| e.to_string())?;

    let logs = stmt
        .query_map(rusqlite::params![user_id, month_pattern], |row| {
            Ok(TimeLog {
                id: row.get(0)?,
                user_id: row.get(1)?,
                date: row.get(2)?,
                time_in: row.get(3)?,
                time_out: row.get(4)?,
                duration_seconds: row.get(5)?,
                event_type: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(logs)
}

// ZMIANA: Statystyki liczone PRECYZYJNIE dla wybranego miesiąca i roku
#[tauri::command]
pub fn get_dashboard_stats(
    user_id: i32,
    year: i32,
    month: i32,
    state: tauri::State<AppState>,
) -> Result<DashboardStats, String> {
    let db = state.db.lock().map_err(|_| "Błąd bazy")?;
    let today = crate::time_calc::current_date();

    let target_month_pattern = format!("{:04}-{:02}-%", year, month);

    // 1. Norma dzienna w sekundach (np. 8h = 28800 s)
    // Bieżące ustawienie służy tylko jako zapas, gdy brak historii normy.
    let default_target_seconds: i64 = db
        .query_row(
            "SELECT value FROM settings WHERE key = 'daily_target_seconds'",
            [],
            |r| r.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "28800".to_string())
        .parse()
        .unwrap_or(28800);

    // Historia normy + weekendy/święta (norma 0)
    let target_history = load_target_history(&db);
    let today_target_seconds = target_for_date(&target_history, &today, default_target_seconds);
    let today_is_non_working = crate::time_calc::is_non_working_day(&today);

    // 2. Pierwsze wejście dzisiaj i przerwy prywatne dzisiaj
    let today_first_in: Option<String> = db
        .query_row(
            "SELECT time_in FROM time_log WHERE user_id = ? AND date = ? ORDER BY id ASC LIMIT 1",
            rusqlite::params![user_id, today],
            |r| r.get(0),
        )
        .ok();

    let today_private_break_seconds: i64 = db
        .query_row(
            "SELECT COALESCE(SUM(duration_seconds), 0) FROM time_log 
             WHERE user_id = ? AND date = ? AND event_type = 'break_private'",
            rusqlite::params![user_id, today],
            |r| r.get(0),
        )
        .unwrap_or(0);

    // 3. LICZENIE SALDA DLA KAŻDEGO DNIA Z AKTYWNOŚCIĄ W WYBRANYM MIESIĄCU
    let mut stmt = db.prepare(
        "SELECT date, SUM(duration_seconds) FROM time_log 
         WHERE user_id = ? AND date LIKE ? AND event_type IN ('work', 'business') AND duration_seconds IS NOT NULL
         GROUP BY date"
    ).map_err(|e| e.to_string())?;

    let daily_totals = stmt
        .query_map(
            rusqlite::params![user_id, target_month_pattern],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
        )
        .map_err(|e| e.to_string())?;

    // Dzisiejszy dzień liczymy osobno – do godziny "na zero" wchodzi
    // wyłącznie saldo z POPRZEDNICH dni (inaczej wynik skacze w ciągu dnia).
    let mut previous_days_balance_seconds: i64 = 0;
    let mut today_balance_seconds: Option<i64> = None;

    for (date, total) in daily_totals.filter_map(|r| r.ok()) {
        // Norma tego konkretnego dnia: 0 w weekend/święto, inaczej wg historii normy
        let diff = total - target_for_date(&target_history, &date, default_target_seconds);
        if date == today {
            today_balance_seconds = Some(diff);
        } else {
            previous_days_balance_seconds += diff;
        }
    }

    // Czy dziś jest jeszcze otwarta sesja (praca / wyjście)?
    let today_has_open_session: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM time_log WHERE user_id = ? AND date = ? AND time_out IS NULL)",
            rusqlite::params![user_id, today],
            |r| r.get(0),
        )
        .unwrap_or(false);

    // Wyświetlane saldo: w trakcie dnia tylko poprzednie dni,
    // po zakończeniu dnia (brak otwartej sesji) – razem z dzisiejszym wynikiem.
    let monthly_balance_seconds = match today_balance_seconds {
        Some(today_diff) if !today_has_open_session => previous_days_balance_seconds + today_diff,
        _ => previous_days_balance_seconds,
    };

    // 4. Wyliczenie godzin wyjścia
    let target_leave_time = if let Some(ref first_in) = today_first_in {
        crate::time_calc::calculate_target_leave_time(
            first_in,
            today_target_seconds,
            previous_days_balance_seconds,
            today_private_break_seconds,
        )
    } else {
        "---".to_string()
    };

    // W weekend / święto nie ma "pełnego dnia" – cały czas to nadgodziny
    let standard_leave_time = match today_first_in {
        Some(ref first_in) if !today_is_non_working => {
            crate::time_calc::calculate_standard_leave_time(
                first_in,
                today_target_seconds,
                today_private_break_seconds,
            )
        }
        _ => "---".to_string(),
    };

    Ok(DashboardStats {
        today_first_in,
        target_leave_time,
        standard_leave_time,
        monthly_balance_seconds,
        today_private_break_seconds,
        daily_target_seconds: today_target_seconds,
    })
}
// ==========================================
// 3. EDYCJA RETROAKTYWNA I RAPORTY (KROK 4)
// ==========================================

/// Waliduje dane z formularza wpisu (dodawanie / edycja).
/// Zwraca: (data, pełne wejście, pełne wyjście, czas trwania w sekundach).
/// Godziny "8:00" / "08:00" są uzupełniane do "08:00:00".
fn build_manual_entry(
    date: &str,
    time_in: &str,
    time_out: Option<&str>,
) -> Result<(String, String, Option<String>, Option<i64>), String> {
    let date = crate::time_calc::normalize_date(date)?;
    let full_time_in = format!("{} {}", date, crate::time_calc::normalize_time(time_in)?);

    let full_time_out = match time_out.map(str::trim).filter(|t| !t.is_empty()) {
        Some(t) => Some(format!("{} {}", date, crate::time_calc::normalize_time(t)?)),
        None => None,
    };

    let duration_seconds = match &full_time_out {
        Some(out_time) => {
            let duration = crate::time_calc::calculate_duration_seconds(&full_time_in, out_time);
            if duration < 0 {
                return Err("Godzina Stop nie może być wcześniejsza niż Start.".into());
            }
            Some(duration)
        }
        None => None,
    };

    Ok((date, full_time_in, full_time_out, duration_seconds))
}

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
    let (date, full_time_in, full_time_out, duration_seconds) =
        build_manual_entry(&date, &time_in, time_out.as_deref())?;

    let db = state.db.lock().map_err(|_| "Błąd bazy")?;

    db.execute(
        "INSERT INTO time_log (user_id, date, time_in, time_out, duration_seconds, event_type) 
         VALUES (?, ?, ?, ?, ?, ?)",
        rusqlite::params![
            user_id,
            date,
            full_time_in,
            full_time_out,
            duration_seconds,
            event_type
        ],
    )
    .map_err(|e| format!("Błąd dodawania wpisu: {}", e))?;

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
    let (date, full_time_in, full_time_out, duration_seconds) =
        build_manual_entry(&date, &time_in, time_out.as_deref())?;

    let db = state.db.lock().map_err(|_| "Błąd bazy")?;

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

// ==========================================
// 4. USTAWIENIA I ZARZĄDZANIE UŻYTKOWNIKAMI (KROK 5)
// ==========================================

// Pobieranie domyślnej normy dziennej w sekundach
#[tauri::command]
pub fn get_daily_target_seconds(state: tauri::State<AppState>) -> Result<i64, String> {
    let db = state.db.lock().map_err(|_| "Błąd bazy")?;

    let seconds_str: String = db
        .query_row(
            "SELECT value FROM settings WHERE key = 'daily_target_seconds'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "28800".to_string());

    Ok(seconds_str.parse().unwrap_or(28800))
}

// Zapisywanie nowej normy dziennej
#[tauri::command]
pub fn set_daily_target_seconds(
    seconds: i64,
    state: tauri::State<AppState>,
) -> Result<String, String> {
    if !(0..=24 * 3600).contains(&seconds) {
        return Err("Norma musi mieścić się w przedziale 0–24h".into());
    }

    let db = state.db.lock().map_err(|_| "Błąd bazy")?;
    let today = crate::time_calc::current_date();

    db.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('daily_target_seconds', ?)",
        [seconds.to_string()],
    )
    .map_err(|e| format!("Błąd zapisu ustawień: {}", e))?;

    // Nowa norma obowiązuje od dziś – starsze dni zachowują swoją normę
    db.execute(
        "INSERT OR REPLACE INTO daily_target_history (effective_from, seconds) VALUES (?, ?)",
        params![today, seconds],
    )
    .map_err(|e| format!("Błąd zapisu historii normy: {}", e))?;

    Ok(format!("Zapisano nową normę czasową (obowiązuje od {})", today))
}

/// Historia normy dziennej: (obowiązuje_od, sekundy), rosnąco po dacie.
fn load_target_history(db: &rusqlite::Connection) -> Vec<(String, i64)> {
    let mut stmt = match db.prepare(
        "SELECT effective_from, seconds FROM daily_target_history ORDER BY effective_from ASC",
    ) {
        Ok(stmt) => stmt,
        Err(_) => return Vec::new(),
    };

    let history: Vec<(String, i64)> = match stmt.query_map([], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
    }) {
        Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
        Err(_) => Vec::new(),
    };
    history
}

/// Norma dla konkretnego dnia: 0 w weekendy i święta, w pozostałe dni norma
/// obowiązująca w tym dniu wg historii (a gdy brak historii – `fallback`).
fn target_for_date(history: &[(String, i64)], date: &str, fallback: i64) -> i64 {
    if crate::time_calc::is_non_working_day(date) {
        return 0;
    }
    history
        .iter()
        .rev()
        .find(|(effective_from, _)| effective_from.as_str() <= date)
        .map(|(_, seconds)| *seconds)
        .unwrap_or(fallback)
}

// ==========================================
// 5. MODUŁ URLOPÓW I ABSENCJI (KROK 6)
// ==========================================

#[tauri::command]
pub fn add_absence(
    user_id: i32,
    start_date: String,
    end_date: String,
    absence_type: String,
    state: tauri::State<AppState>,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "Błąd bazy")?;

    let start =
        chrono::NaiveDate::parse_from_str(&start_date, "%Y-%m-%d").map_err(|e| e.to_string())?;
    let end =
        chrono::NaiveDate::parse_from_str(&end_date, "%Y-%m-%d").map_err(|e| e.to_string())?;

    if end < start {
        return Err("Data końcowa nie może być wcześniejsza niż początkowa!".into());
    }

    let mut current = start;
    while current <= end {
        let date_str = current.format("%Y-%m-%d").to_string();

        // Zapisujemy nieobecność (ignorujemy jeśli wpis na ten dzień już istnieje)
        let _ = db.execute(
            "INSERT OR IGNORE INTO absence_log (user_id, date, absence_type) VALUES (?, ?, ?)",
            rusqlite::params![user_id, date_str, absence_type],
        );

        current += chrono::Duration::days(1);
    }

    Ok("Dodano nieobecność".into())
}

#[tauri::command]
pub fn get_absences(
    user_id: i32,
    state: tauri::State<AppState>,
) -> Result<Vec<AbsenceLog>, String> {
    let db = state.db.lock().map_err(|_| "Błąd bazy")?;

    let mut stmt = db.prepare(
        "SELECT id, user_id, date, absence_type FROM absence_log WHERE user_id = ? ORDER BY date DESC"
    ).map_err(|e| e.to_string())?;

    let absences = stmt
        .query_map([user_id], |row| {
            Ok(AbsenceLog {
                id: row.get(0)?,
                user_id: row.get(1)?,
                date: row.get(2)?,
                absence_type: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(absences)
}

#[tauri::command]
pub fn delete_absence(absence_id: i32, state: tauri::State<AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "Błąd bazy")?;

    db.execute("DELETE FROM absence_log WHERE id = ?", [absence_id])
        .map_err(|e| e.to_string())?;

    Ok("Usunięto nieobecność".into())
}

// ==========================================
// 6. IMPORT / EKSPORT CSV (KROK 7)
// ==========================================

// IMPORT CSV
#[tauri::command]
pub fn import_csv_data(
    user_id: i32,
    csv_content: String,
    state: tauri::State<AppState>,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "Błąd bazy")?;

    let mut lines = csv_content.lines().peekable();
    let mut imported_count = 0;

    let mut current_in_date: Option<String> = None;
    let mut current_in_time: Option<String> = None;

    while let Some(line) = lines.next() {
        let parts: Vec<&str> = line.trim().split(',').collect();
        if parts.len() < 3 {
            continue;
        }

        let date = parts[0].trim();
        let time = parts[1].trim();
        let action = parts[2].trim().to_uppercase();

        let full_timestamp = format!("{} {}", date, time);

        if action == "IN" {
            // Jeśli mieliśmy wcześniej wiszący "IN" bez "OUT", zapisujemy go jako otwartą sesję
            if let (Some(prev_date), Some(prev_time)) =
                (current_in_date.take(), current_in_time.take())
            {
                let prev_timestamp = format!("{} {}", prev_date, prev_time);
                let _ = db.execute(
                    "INSERT INTO time_log (user_id, date, time_in, event_type) VALUES (?, ?, ?, 'work')",
                    rusqlite::params![user_id, prev_date, prev_timestamp],
                );
                imported_count += 1;
            }

            current_in_date = Some(date.to_string());
            current_in_time = Some(time.to_string());
        } else if action == "OUT" {
            if let (Some(in_date), Some(in_time)) = (current_in_date.take(), current_in_time.take())
            {
                let full_in = format!("{} {}", in_date, in_time);
                let duration =
                    crate::time_calc::calculate_duration_seconds(&full_in, &full_timestamp);

                let _ = db.execute(
                    "INSERT INTO time_log (user_id, date, time_in, time_out, duration_seconds, event_type) 
                     VALUES (?, ?, ?, ?, ?, 'work')",
                    rusqlite::params![user_id, in_date, full_in, full_timestamp, duration],
                );
                imported_count += 1;
            }
        }
    }

    // Jeśli na końcu pliku pozostał wiszący IN
    if let (Some(in_date), Some(in_time)) = (current_in_date, current_in_time) {
        let full_in = format!("{} {}", in_date, in_time);
        let _ = db.execute(
            "INSERT INTO time_log (user_id, date, time_in, event_type) VALUES (?, ?, ?, 'work')",
            rusqlite::params![user_id, in_date, full_in],
        );
        imported_count += 1;
    }

    Ok(format!(
        "Pomyślnie zaimportowano {} sesji z pliku CSV!",
        imported_count
    ))
}

// EKSPORT CSV
#[tauri::command]
pub fn export_csv_data(user_id: i32, state: tauri::State<AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "Błąd bazy")?;

    let mut stmt = db
        .prepare(
            "SELECT date, time_in, time_out FROM time_log 
         WHERE user_id = ? AND event_type = 'work' ORDER BY id ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([user_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut csv_lines = Vec::new();

    for r in rows.filter_map(|r| r.ok()) {
        let date = r.0;
        let time_in = r.1.split(' ').nth(1).unwrap_or(&r.1).to_string();
        csv_lines.push(format!("{},{},IN", date, time_in));

        if let Some(time_out_full) = r.2 {
            let time_out = time_out_full
                .split(' ')
                .nth(1)
                .unwrap_or(&time_out_full)
                .to_string();
            csv_lines.push(format!("{},{},OUT", date, time_out));
        }
    }

    Ok(csv_lines.join("\n"))
}

#[tauri::command]
pub fn get_all_users(state: tauri::State<AppState>) -> Result<Vec<User>, String> {
    let db = state.db.lock().map_err(|_| "Błąd bazy")?;

    let mut stmt = db
        .prepare("SELECT id, username, role FROM users ORDER BY username ASC")
        .map_err(|e| e.to_string())?;

    let users = stmt
        .query_map([], |row| {
            Ok(User {
                id: row.get(0)?,
                username: row.get(1)?,
                role: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(users)
}
