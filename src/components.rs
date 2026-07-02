use askama::Template;
use sea_orm::ColumnTrait;
use sea_orm::DatabaseConnection;
use sea_orm::EntityTrait;
use sea_orm::PaginatorTrait;
use sea_orm::QueryFilter;
use uuid::Uuid;

use crate::entity::prelude::*;

/// Generate a URL-safe slug from a title using the `slug` crate.
/// If the slug already exists in the database, a numeric suffix is appended.
pub async fn unique_slug(conn: &DatabaseConnection, title: &str) -> String {
    let base = slug::slugify(title);
    let base = if base.is_empty() {
        "untitled".to_string()
    } else {
        base
    };

    // Check if the slug already exists
    let existing = ContentItems::find()
        .filter(crate::entity::content_items::Column::Title.eq(&base))
        .count(conn)
        .await
        .unwrap_or(0);

    if existing == 0 {
        return base;
    }

    // Try suffixes
    for i in 1..10000 {
        let candidate = format!("{base}-{i}");
        let count = ContentItems::find()
            .filter(crate::entity::content_items::Column::Slug.eq(&candidate))
            .count(conn)
            .await
            .unwrap_or(0);
        if count == 0 {
            return candidate;
        }
    }

    // Extremely unlikely fallback
    format!("{base}-{}", uuid::Uuid::new_v4().as_simple())
}

/// Format an i64 view count into a human-readable string like "1.2K views".
pub fn format_view_count(count: i64) -> String {
    if count >= 1_000_000 {
        let millions = count as f64 / 1_000_000.0;
        if millions < 10.0 {
            // format!("{:.1}M views", millions)
            format!("{:.1}M", millions)
        } else {
            // format!("{:.0}M views", millions)
            format!("{:.0}M", millions)
        }
    } else if count >= 1_000 {
        let thousands = count as f64 / 1_000.0;
        if thousands < 10.0 {
            // format!("{:.1}K views", thousands)
            format!("{:.1}K", thousands)
        } else {
            // format!("{:.0}K views", thousands)
            format!("{:.0}K", thousands)
        }
    } else {
        // format!("{} views", count)
        format!("{}", count)
    }
}

#[derive(Template)]
#[template(path = "content-processing.html")]
pub struct ProcessingPage {
    pub username: String,
    pub logged_in: bool,
    pub session_avatar_url: Option<String>,
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
