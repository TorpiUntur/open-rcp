// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    rcp_tauri_lib::run(); // Jeśli nazwa pakietu w Cargo.toml to rcp_tauri_lib, inaczej dopasuj nazwę!
}
