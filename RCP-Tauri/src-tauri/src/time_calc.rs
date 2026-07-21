use chrono::{NaiveDateTime, Local, Datelike};

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

// Liczymy różnicę W SEKUNDACH
pub fn calculate_duration_seconds(time_in: &str, time_out: &str) -> i64 {
    let fmt = "%Y-%m-%d %H:%M:%S";
    if let (Ok(start), Ok(end)) = (
        NaiveDateTime::parse_from_str(time_in, fmt),
        NaiveDateTime::parse_from_str(time_out, fmt),
    ) {
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
    let fmt = "%Y-%m-%d %H:%M:%S";
    if let Ok(start) = NaiveDateTime::parse_from_str(first_time_in_today, fmt) {
        // Wymagany czas dzisiaj = norma - saldo_z_poprzednich_dni + dzisiejsza_przerwa
        let required_seconds = daily_target_seconds - previous_days_balance_seconds + today_private_break_seconds;

        let target_time = start + chrono::Duration::seconds(required_seconds);
        target_time.format("%H:%M:%S").to_string()
    } else {
        "---".to_string()
    }
}