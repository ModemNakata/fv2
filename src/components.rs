use askama::Template;
use uuid::Uuid;

/// Format an i64 view count into a human-readable string like "1.2K views".
pub fn format_view_count(count: i64) -> String {
    if count >= 1_000_000 {
        let millions = count as f64 / 1_000_000.0;
        if millions < 10.0 {
            format!("{:.1}M views", millions)
        } else {
            format!("{:.0}M views", millions)
        }
    } else if count >= 1_000 {
        let thousands = count as f64 / 1_000.0;
        if thousands < 10.0 {
            format!("{:.1}K views", thousands)
        } else {
            format!("{:.0}K views", thousands)
        }
    } else {
        format!("{} views", count)
    }
}

#[derive(Template)]
#[template(path = "content-processing.html")]
pub struct ProcessingPage {
    pub username: String,
    pub logged_in: bool,
    pub title: String,
    pub content_type_label: String,
    pub content_status: String,
    pub content_id: Uuid,
    pub version: String,
}

pub struct SortOption {
    pub value: String,
    pub label: &'static str,
    pub active: bool,
}

pub fn build_sort_options(current_sort: &str, current_order: &str) -> Vec<SortOption> {
    let pairs: [(&str, &str); 4] = [
        ("date-desc", "Newest first"),
        ("date-asc", "Oldest first"),
        ("views-desc", "Most viewed"),
        ("views-asc", "Least viewed"),
        // ("likes-desc", "Most liked"),
        // ("likes-asc", "Least liked"),
    ];

    let combined = format!("{}-{}", current_sort, current_order);

    pairs
        .iter()
        .map(|(value, label)| SortOption {
            value: value.to_string(),
            label,
            active: *value == combined,
        })
        .collect()
}
