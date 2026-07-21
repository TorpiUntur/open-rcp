use std::sync::Mutex;
use rusqlite::Connection;
use tauri::Manager;

mod db;
mod commands;
mod time_calc; // Twój plik z kalkulacjami

pub struct AppState {
    pub db: Mutex<Connection>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Inicjalizacja bazy danych
            let conn = db::initialize_database(app.handle())
                .expect("Nie udało się zainicjalizować bazy danych");

            app.manage(AppState {
                db: Mutex::new(conn),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::check_auto_login,
            commands::login,
            commands::logout,
            commands::create_user,
            commands::clock_in,
            commands::clock_out,
            commands::return_to_work,
            commands::get_logs,
            commands::get_dashboard_stats // <-- DODAJ TO
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}