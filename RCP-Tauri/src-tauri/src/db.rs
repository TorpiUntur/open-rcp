use rusqlite::{Connection, Result};
use std::fs;
use tauri::AppHandle;
use tauri::Manager;

pub fn initialize_database(
    app_handle: &AppHandle,
) -> Result<Connection, Box<dyn std::error::Error>> {
    let app_dir = app_handle.path().app_data_dir()?;
    fs::create_dir_all(&app_dir)?;

    let db_path = app_dir.join("data.db");
    let conn = Connection::open(db_path)?;

    // Włączenie obsługi kluczy obcych w SQLite
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    // 1. Tabela Użytkowników
    conn.execute(
        "CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user'
        )",
        [],
    )?;

    // 2. Tabela Ustawień (target 8h, zapamiętana sesja)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
        [],
    )?;

    // 3. Tabela Rejestracji Czasu
    // W db.rs
    conn.execute(
        "CREATE TABLE IF NOT EXISTS time_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        time_in TEXT NOT NULL,
        time_out TEXT,
        duration_seconds INTEGER,
        event_type TEXT DEFAULT 'work',
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )",
        [],
    )?;

    // Ustawienie normy dziennej na 28800 sekund (8h)
    conn.execute(
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('daily_target_seconds', '28800')",
        [],
    )?;
    // 4. Tabela Absencji (L4 / Urlopy)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS absence_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            absence_type TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // Wsianie domyślnego konta admina, jeśli baza jest pusta
    seed_initial_data(&conn)?;

    Ok(conn)
}

fn seed_initial_data(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
    let default_pass_hash = format!("{:x}", md5::compute("admin123"));

    // Zapytanie doda admina jeśli użytkownik 'admin' jeszcze nie istnieje
    conn.execute(
        "INSERT OR IGNORE INTO users (username, password_hash, role) VALUES ('admin', ?, 'admin')",
        [&default_pass_hash],
    )?;

    conn.execute(
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('daily_target_seconds', '28800')",
        [],
    )?;

    Ok(())
}
