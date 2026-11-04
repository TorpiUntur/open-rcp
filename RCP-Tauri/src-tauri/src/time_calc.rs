use chrono::{Datelike, Duration, Local, NaiveDate, NaiveDateTime, NaiveTime};

pub fn current_timestamp() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

pub fn current_date() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

pub fn current_month_start() -> String {
    let now = Local::now();
    format!("{:04}-{:02}-01", now.year(), now.month())
}

/// Parsuje znacznik czasu "YYYY-MM-DD HH:MM:SS".
/// Akceptuje też stary format bez sekund ("YYYY-MM-DD HH:MM"), żeby
/// wcześniej zapisane błędne wpisy nadal się liczyły.
fn parse_timestamp(value: &str) -> Option<NaiveDateTime> {
    let value = value.trim();
    NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S")
        .or_else(|_| NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M"))
        .ok()
}

/// Normalizuje godzinę wpisaną ręcznie do formatu "HH:MM:SS".
/// Akceptuje: "8:00", "08:00", "08:00:00", "8.00", "08.00.00".
pub fn normalize_time(input: &str) -> Result<String, String> {
    let cleaned = input.trim().replace('.', ":");
    for fmt in ["%H:%M:%S", "%H:%M"] {
        if let Ok(parsed) = NaiveTime::parse_from_str(&cleaned, fmt) {
            return Ok(parsed.format("%H:%M:%S").to_string());
        }
    }
    Err(format!(
        "Niepoprawna godzina: \"{}\" (użyj formatu GG:MM lub GG:MM:SS)",
        input.trim()
    ))
}

/// Sprawdza datę w formacie "YYYY-MM-DD" i zwraca ją znormalizowaną.
pub fn normalize_date(input: &str) -> Result<String, String> {
    NaiveDate::parse_from_str(input.trim(), "%Y-%m-%d")
        .map(|d| d.format("%Y-%m-%d").to_string())
        .map_err(|_| format!("Niepoprawna data: \"{}\"", input.trim()))
}

// Liczymy różnicę W SEKUNDACH
pub fn calculate_duration_seconds(time_in: &str, time_out: &str) -> i64 {
    if let (Some(start), Some(end)) = (parse_timestamp(time_in), parse_timestamp(time_out)) {
        (end - start).num_seconds()
    } else {
        0
    }
}

// Obliczanie dokładnego wyjścia "Na Zero" co do sekundy
pub fn calculate_target_leave_time(
    first_time_in_today: &str,
    daily_target_seconds: i64,
    previous_days_balance_seconds: i64,
    today_private_break_seconds: i64,
) -> String {
    if let Some(start) = parse_timestamp(first_time_in_today) {
        // Wymagany czas dzisiaj = norma - saldo_z_poprzednich_dni + dzisiejsza_przerwa
        let required_seconds =
            daily_target_seconds - previous_days_balance_seconds + today_private_break_seconds;

        let target_time = start + chrono::Duration::seconds(required_seconds);
        // Pełny znacznik z datą – frontend porównuje prawdziwe daty (wyjście może wypaść po północy)
        target_time.format("%Y-%m-%d %H:%M:%S").to_string()
    } else {
        "---".to_string()
    }
}

/// Oblicza godzinę wyjścia po przepracowaniu pełnej normy dziennej (z dokładnością do sekund)
pub fn calculate_standard_leave_time(
    first_in_str: &str,
    daily_target_seconds: i64,
    today_private_break_seconds: i64,
) -> String {
    if let Some(start) = parse_timestamp(first_in_str) {
        let total_needed_seconds = daily_target_seconds + today_private_break_seconds;
        let target_time = start + chrono::Duration::seconds(total_needed_seconds);
        target_time.format("%Y-%m-%d %H:%M:%S").to_string()
    } else {
        "---".to_string()
    }
}
