use chrono::{Datelike, Duration, Local, NaiveDate, NaiveDateTime, NaiveTime, Weekday};

/// Niedziela Wielkanocna (algorytm Meeusa/Jonesa/Butchera, kalendarz gregoriański).
fn easter_sunday(year: i32) -> Option<NaiveDate> {
    let a = year % 19;
    let b = year / 100;
    let c = year % 100;
    let d = b / 4;
    let e = b % 4;
    let f = (b + 8) / 25;
    let g = (b - f + 1) / 3;
    let h = (19 * a + b - d - g + 15) % 30;
    let i = c / 4;
    let k = c % 4;
    let l = (32 + 2 * e + 2 * i - h - k) % 7;
    let m = (a + 11 * h + 22 * l) / 451;
    let month = (h + l - 7 * m + 114) / 31;
    let day = (h + l - 7 * m + 114) % 31 + 1;
    NaiveDate::from_ymd_opt(year, month as u32, day as u32)
}

/// Polskie święta ustawowe (dni wolne od pracy).
pub fn is_polish_holiday(date: NaiveDate) -> bool {
    let (year, month, day) = (date.year(), date.month(), date.day());

    let fixed = matches!(
        (month, day),
        (1, 1)      // Nowy Rok
            | (1, 6)   // Trzech Króli
            | (5, 1)   // Święto Pracy
            | (5, 3)   // Święto Konstytucji 3 Maja
            | (8, 15)  // Wniebowzięcie NMP
            | (11, 1)  // Wszystkich Świętych
            | (11, 11) // Święto Niepodległości
            | (12, 25) // Boże Narodzenie (1. dzień)
            | (12, 26) // Boże Narodzenie (2. dzień)
    ) || (year >= 2025 && month == 12 && day == 24); // Wigilia – wolna od 2025

    if fixed {
        return true;
    }

    // Święta ruchome liczone od Wielkanocy:
    // 0 = Wielkanoc, 1 = Poniedziałek Wielkanocny, 49 = Zielone Świątki, 60 = Boże Ciało
    if let Some(easter) = easter_sunday(year) {
        for offset in [0, 1, 49, 60] {
            if date == easter + Duration::days(offset) {
                return true;
            }
        }
    }

    false
}

/// Dzień wolny (sobota, niedziela lub święto) – norma 0, cały czas pracy to nadgodziny.
/// Data w formacie "YYYY-MM-DD"; przy błędnym formacie zwraca false.
pub fn is_non_working_day(date_str: &str) -> bool {
    match NaiveDate::parse_from_str(date_str.trim(), "%Y-%m-%d") {
        Ok(date) => {
            matches!(date.weekday(), Weekday::Sat | Weekday::Sun) || is_polish_holiday(date)
        }
        Err(_) => false,
    }
}

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
