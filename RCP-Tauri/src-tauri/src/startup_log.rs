// ==========================================
// DIAGNOSTYKA STARTU (#13 – biały ekran przy starcie)
// ==========================================
// - prosty log do pliku: %LOCALAPPDATA%\com.rcp.timetracker\logs\rcp.log
//   (każda linia: czas, PID procesu, ms od startu procesu, komunikat)
// - watchdog: jeśli strona nie zgłosi gotowości (komenda `frontend_ready`)
//   w ciągu 15 s, przeładowuje ją (maks. 2 razy) i zapisuje to w logu

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, Runtime};

static LOG_PATH: OnceLock<PathBuf> = OnceLock::new();
static PROCESS_START: OnceLock<Instant> = OnceLock::new();
static FRONTEND_READY: AtomicBool = AtomicBool::new(false);

const MAX_LOG_BYTES: u64 = 1024 * 1024; // powyżej 1 MB → rcp.old.log
const WATCHDOG_TIMEOUT: Duration = Duration::from_secs(15);
const WATCHDOG_MAX_RELOADS: u32 = 2;

/// Wywołać jako pierwsze w `run()` – punkt odniesienia dla "+X ms" w logu.
pub fn mark_process_start() {
    let _ = PROCESS_START.set(Instant::now());
}

fn elapsed_ms() -> u128 {
    PROCESS_START
        .get()
        .map(|start| start.elapsed().as_millis())
        .unwrap_or(0)
}

/// Ustawia plik logu (z prostą rotacją przy > 1 MB).
pub fn init(log_dir: PathBuf) {
    if fs::create_dir_all(&log_dir).is_err() {
        return;
    }
    let path = log_dir.join("rcp.log");
    if let Ok(meta) = fs::metadata(&path) {
        if meta.len() > MAX_LOG_BYTES {
            let _ = fs::rename(&path, log_dir.join("rcp.old.log"));
        }
    }
    let _ = LOG_PATH.set(path);
}

/// Dopisuje linię do logu. Nigdy nie panikuje – błędy zapisu są ignorowane.
pub fn log(msg: &str) {
    let line = format!(
        "{} [pid {} | +{} ms] {}",
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f"),
        std::process::id(),
        elapsed_ms(),
        msg
    );

    #[cfg(debug_assertions)]
    eprintln!("{}", line);

    if let Some(path) = LOG_PATH.get() {
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(file, "{}", line);
        }
    }
}

/// Watchdog w osobnym wątku: jeśli strona nie zgłosi gotowości, przeładuj ją.
pub fn start_watchdog<R: Runtime>(app: AppHandle<R>) {
    std::thread::spawn(move || {
        for attempt in 1..=WATCHDOG_MAX_RELOADS {
            std::thread::sleep(WATCHDOG_TIMEOUT);
            if FRONTEND_READY.load(Ordering::SeqCst) {
                return;
            }

            log(&format!(
                "WATCHDOG: brak sygnału gotowości strony po {} s – przeładowanie (próba {}/{})",
                WATCHDOG_TIMEOUT.as_secs(),
                attempt,
                WATCHDOG_MAX_RELOADS
            ));

            match app.get_webview_window("main") {
                Some(window) => {
                    if let Err(e) = window.eval("window.location.reload()") {
                        log(&format!("WATCHDOG: błąd przeładowania strony: {}", e));
                    }
                }
                None => log("WATCHDOG: nie znaleziono okna 'main'"),
            }
        }

        std::thread::sleep(WATCHDOG_TIMEOUT);
        if !FRONTEND_READY.load(Ordering::SeqCst) {
            log("WATCHDOG: strona nadal się nie załadowała – poddaję się (zamknij i uruchom ponownie)");
        }
    });
}

/// Frontend woła to jako pierwsze po załadowaniu `main.js`.
#[tauri::command]
pub fn frontend_ready() {
    if !FRONTEND_READY.swap(true, Ordering::SeqCst) {
        log("Frontend gotowy (strona załadowana, JS i invoke działają)");
    }
}

/// Błędy JS z frontendu trafiają do tego samego logu.
#[tauri::command]
pub fn log_frontend(message: String) {
    let short: String = message.chars().take(500).collect();
    log(&format!("FRONTEND: {}", short));
}
