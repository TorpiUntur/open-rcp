// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::{Connection, Result};
use std::sync::Mutex;
use tauri::State;

struct AppState{
    db: Mutex<Connection>,
}

fn initialize_database() -> Result<Connection>{
    let conn = Connection::open("data.db")?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS time_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            time_in TEXT NOT NULL,
            time_out TEXT,
            duration_minutes INTEGER,
            is_break BOOLEAN DEFAULT 0
        )",
        [], // Empty parameters for this query
    )?;

    Ok(conn)
}

fn main() {

    let db_connection = initialize_database().expect("Failed to initialize database");

    tauri::Builder::default()
        .manage(AppState {
            db: Mutex::new(db_connection),
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
