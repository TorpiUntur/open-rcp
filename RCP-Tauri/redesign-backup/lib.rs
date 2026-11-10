use rusqlite::Connection;
use std::sync::Mutex;
use tauri::webview::PageLoadEvent;
use tauri::Manager;

mod commands;
mod db;
mod startup_log; // Diagnostyka startu: log do pliku + watchdog (#13)
mod time_calc; // Twój plik z kalkulacjami

pub struct AppState {
    pub db: Mutex<Connection>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    startup_log::mark_process_start();

    let app = tauri::Builder::default()
        // Single-instance MUSI być zarejestrowany jako pierwszy plugin.
        // Drugie uruchomienie nie tworzy nowego okna – pokazuje istniejące.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            startup_log::log("Próba uruchomienia drugiej instancji – pokazuję istniejące okno");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        // Log etapów ładowania strony – pokaże, czy WebView2 w ogóle zaczął/skończył ładować
        .on_page_load(|webview, payload| {
            #[allow(unreachable_patterns)]
            let stage = match payload.event() {
                PageLoadEvent::Started => "start",
                PageLoadEvent::Finished => "koniec",
                _ => "inny",
            };
            startup_log::log(&format!(
                "Ładowanie strony [{}]: {} ({})",
                webview.label(),
                stage,
                payload.url()
            ));
        })
        .setup(|app| {
            if let Ok(log_dir) = app.path().app_log_dir() {
                startup_log::init(log_dir);
            }
            startup_log::log(&format!(
                "=== Start aplikacji v{} – setup ===",
                app.package_info().version
            ));
            startup_log::log(&format!(
                "Okno 'main' istnieje w setup: {}",
                app.get_webview_window("main").is_some()
            ));

            // Watchdog startuje od razu – niezależnie od tego, jak długo potrwa baza
            startup_log::start_watchdog(app.handle().clone());

            // Inicjalizacja bazy danych (z pomiarem czasu – przy starcie systemu dysk bywa zajęty)
            startup_log::log("Inicjalizacja bazy danych…");
            let db_start = std::time::Instant::now();
            let conn = match db::initialize_database(app.handle()) {
                Ok(conn) => conn,
                Err(e) => {
                    startup_log::log(&format!("BŁĄD inicjalizacji bazy danych: {}", e));
                    return Err(e);
                }
            };
            startup_log::log(&format!(
                "Baza danych gotowa ({} ms)",
                db_start.elapsed().as_millis()
            ));

            app.manage(AppState {
                db: Mutex::new(conn),
            });

            startup_log::log("Setup zakończony");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            startup_log::frontend_ready,
            startup_log::log_frontend,
            commands::check_auto_login,
            commands::login,
            commands::logout,
            commands::create_user,
            commands::clock_in,
            commands::clock_out,
            commands::return_to_work,
            commands::close_forgotten_sessions,
            commands::get_active_session,
            commands::get_logs,
            commands::get_dashboard_stats,
            commands::add_manual_log,
            commands::update_log,
            commands::delete_log,
            commands::get_daily_target_seconds,
            commands::set_daily_target_seconds,
            commands::add_absence,
            commands::get_absences,
            commands::delete_absence,
            commands::import_csv_data,
            commands::export_csv_data,
            commands::get_all_users
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, event| match event {
        tauri::RunEvent::Ready => startup_log::log("Pętla zdarzeń gotowa (RunEvent::Ready)"),
        tauri::RunEvent::Exit => startup_log::log("Zamykanie aplikacji (RunEvent::Exit)"),
        _ => {}
    });
}
