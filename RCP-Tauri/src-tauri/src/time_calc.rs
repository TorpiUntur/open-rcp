use chrono::{NaiveDateTime, Local};

pub fn current_timestamp() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

pub fn current_date() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

pub fn calculate_duration_minutes(time_in: &str, time_out: &str) -> i64 {
    let fmt = "%Y-%m-%d %H:%M:%S";
    if let (Ok(start), Ok(end)) = (
        NaiveDateTime::parse_from_str(time_in, fmt),
        NaiveDateTime::parse_from_str(time_out, fmt),
    ) {
        (end - start).num_minutes()
    } else {
        0
    }
}