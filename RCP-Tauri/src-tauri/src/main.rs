// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::{Connection, Result};
use std::sync::Mutex;
use tauri::State;
use tauri::Manager;

struct AppState{
    db: Mutex<Connection>,
}


#[tauri::command]
fn add_log(date: String, state: tauri::State<AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "Mutex poisoned")?;
    let rows_affected = db.execute("INSERT INTO time_log (date, time_in) VALUES (?,?)", [&date, "8:00"])
        .map_err(|e| e.to_string())?;
    
    Ok(format!("Successfully inserted {} row(s)", rows_affected))
}


fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let path = app.path().app_data_dir().expect("Failed to get path");
            std::fs::create_dir_all(&path).expect("Failed to create dir");
            
            let conn = Connection::open(path.join("data.db")).expect("Failed to open DB");
            conn.execute("CREATE TABLE IF NOT EXISTS time_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            time_in TEXT NOT NULL,
            time_out TEXT,
            duration_minutes INTEGER,
            is_break BOOLEAN DEFAULT 0
        )", []).expect("Table init failed");
            
        app.manage(AppState { db: Mutex::new(conn) });
        Ok(())
        })
        .invoke_handler(tauri::generate_handler![add_log])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}