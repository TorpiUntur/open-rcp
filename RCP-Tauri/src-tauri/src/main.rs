// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use rusqlite::Connection;
use tauri::Manager;

// 1. Informujemy Rust o nowym pliku modułu commands.rs
mod commands;

// 2. Struktura stanu aplikacji (musi być `pub`, aby commands.rs mógł z niej korzystać)
pub struct AppState {
    pub db: Mutex<Connection>,
}

fn initialize_database(app_handle: &tauri::AppHandle) -> Result<Connection, Box<dyn std::error::Error>> {
    let app_dir = app_handle.path().app_data_dir()?;
    std::fs::create_dir_all(&app_dir)?;
    
    let db_path = app_dir.join("data.db");
    let conn = Connection::open(db_path)?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS time_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            time_in TEXT NOT NULL,
            time_out TEXT,
            duration_minutes INTEGER,
            is_break BOOLEAN DEFAULT 0
        )",
        [],
    )?;

    Ok(conn)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let conn = initialize_database(app.handle())?;
            app.manage(AppState {
                db: Mutex::new(conn),
            });
            Ok(())
        })
        // 3. Rejestrujemy funkcje wyciągnięte z modułu commands!
        .invoke_handler(tauri::generate_handler![
            commands::clock_in,
            commands::clock_out,
            commands::get_logs
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}