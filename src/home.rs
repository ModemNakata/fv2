use actix_session::Session;
use actix_web::{Responder, Result, web};
use askama::Template;
use chrono::{DateTime as ChronoDateTime, Utc};
use sea_orm::*;
use uuid::Uuid;

use crate::AppState;
use crate::auth;
use crate::components::build_sort_options;
use crate::components::SortOption;
use crate::entity::prelude::*;
use crate::entity::sea_orm_active_enums::*;
use crate::entity::{content_items, users};

#[derive(Template)]
#[template(path = "index.html")]
struct HomePage {
    username: String,
    logged_in: bool,
    videos: Vec<VideoItem>,
    pagination: Pagination,
    total_count: u64,
    search_query: String,
    sort_options: Vec<SortOption>,
    content_type_label: String,
    version: String,
}

struct VideoItem {
    id: Uuid,
    title: String,
    views: String,
    favourite_count: String,
    duration: String,
    time_ago: String,
    thumbnail_url: Option<String>,
    preview_url: Option<String>,
    uploader_avatar_url: Option<String>,
    uploader_display_name: String,
    uploader_username: String,
    hue: u32,
}

struct PageButton {
    num: u32,
    is_active: bool,
}

struct Pagination {
    current_page: u32,
    total_pages: u32,
    limit: u32,
    pages: Vec<PageButton>,
    query_params: String,
}

fn url_encode(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b' ' => result.push('+'),
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => result.push(b as char),
            _ => result.push_str(&format!("%{:02X}", b)),
        }
    }
    result
}

pub async fn index(
    session: Session,
    state: web::Data<AppState>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> Result<impl Responder> {
    let session_user = auth::get_session_user(&session, &state.conn).await;
    let logged_in = session_user.is_some();

    let limit: u32 = query
        .get("limit")
        .and_then(|v| v.parse().ok())
        .unwrap_or(20)
        .min(50);
    let page: u32 = query
        .get("page")
        .and_then(|v| v.parse().ok())
        .unwrap_or(1)
        .max(1);

    let offset = (page - 1) * limit;

    let q = query.get("q").filter(|s| !s.is_empty()).cloned();
    let search_query = q.clone().unwrap_or_default();
    let sort = query
        .get("sort")
        .map(String::as_str)
        .unwrap_or("date")
        .to_string();
    let order = query
        .get("order")
        .map(String::as_str)
        .unwrap_or("desc")
        .to_string();

    let mut base_filter = Condition::all()
        .add(content_items::Column::Status.eq(ContentStatus::Ready))
        .add(content_items::Column::Type.eq(ContentType::Video))
        .add(content_items::Column::Visibility.eq(ContentVisibility::Public));

    if let Some(ref query_str) = q {
        base_filter = base_filter.add(content_items::Column::Title.contains(query_str));
    }

    let total = ContentItems::find()
        .filter(base_filter.clone())
        .count(&state.conn)
        .await
        .map_err(actix_web::error::ErrorInternalServerError)?;

    let total_pages = ((total as u32) + limit - 1) / limit;

    let mut select = ContentItems::find()
        .filter(base_filter)
        .limit(limit as u64)
        .offset(offset as u64);

    match (sort.as_str(), order.as_str()) {
        ("views", "asc") => {
            select = select.order_by_asc(content_items::Column::ViewCount);
        }
        ("views", "desc") => {
            select = select.order_by_desc(content_items::Column::ViewCount);
        }
        ("date", "asc") => {
            select = select.order_by_asc(content_items::Column::CreatedAt);
        }
        _ => {
            select = select.order_by_desc(content_items::Column::CreatedAt);
        }
    }

    let items = select
        .find_also_related(Videos)
        .all(&state.conn)
        .await
        .map_err(actix_web::error::ErrorInternalServerError)?;

    let uploader_ids: Vec<Uuid> = items.iter().map(|(c, _)| c.uploader_id).collect();
    let users_map: std::collections::HashMap<Uuid, (String, String, Option<String>)> =
        if uploader_ids.is_empty() {
            std::collections::HashMap::new()
        } else {
            Users::find()
                .filter(users::Column::Id.is_in(uploader_ids))
                .all(&state.conn)
                .await
                .map_err(actix_web::error::ErrorInternalServerError)?
                .into_iter()
                .map(|u| (u.id, (u.username, u.display_name, u.avatar_url)))
                .collect()
        };

    let s3_endpoint = std::env::var("PUBLIC_S3_ENDPOINT").unwrap_or_default();
    let s3_bucket = std::env::var("S3_BUCKET").unwrap_or_default();
    let s3_base = if s3_endpoint.is_empty() || s3_bucket.is_empty() {
        String::new()
    } else {
        format!("{}/{}", s3_endpoint.trim_end_matches('/'), s3_bucket)
    };

    let now = Utc::now();

    let video_items: Vec<VideoItem> = items
        .into_iter()
        .map(|(content, video_opt)| {
            let duration_secs = video_opt
                .as_ref()
                .and_then(|v| v.duration_seconds)
                .unwrap_or(0);
            let hours = duration_secs / 3600;
            let minutes = (duration_secs % 3600) / 60;
            let secs = duration_secs % 60;
            let duration_str = if hours > 0 {
                format!("{}:{:02}:{:02}", hours, minutes, secs)
            } else {
                format!("{}:{:02}", minutes, secs)
            };

            let views_str = crate::components::format_view_count(content.view_count);

            let favourite_count = content.favorite_count.to_string();

            let (username, display_name, uploader_avatar_url) = users_map
                .get(&content.uploader_id)
                .cloned()
                .unwrap_or_else(|| ("?".to_string(), "?".to_string(), None));

            let hue = (content
                .id
                .to_string()
                .bytes()
                .fold(0u32, |acc, b| acc.wrapping_add(b as u32))
                * 37)
                % 360;

            let time_ago_str = time_ago(&content.created_at, now);

            let thumbnail_url = content
                .thumbnail_url
                .filter(|k| !k.is_empty())
                .map(|key| format!("{}/{}", s3_base, key));

            let preview_url = video_opt
                .as_ref()
                .and_then(|v| v.preview_path.as_ref())
                .filter(|k| !k.is_empty())
                .map(|key| format!("{}/{}", s3_base, key));

            VideoItem {
                id: content.id,
                title: content.title,
                views: views_str,
                favourite_count,
                duration: duration_str,
                time_ago: time_ago_str,
                thumbnail_url,
                preview_url,
                uploader_avatar_url,
                uploader_display_name: display_name,
                uploader_username: username,
                hue,
            }
        })
        .collect();

    let mut query_params = String::new();
    if !search_query.is_empty() {
        query_params.push_str("&q=");
        query_params.push_str(&url_encode(&search_query));
    }
    query_params.push_str("&sort=");
    query_params.push_str(&sort);
    query_params.push_str("&order=");
    query_params.push_str(&order);

    let pages: Vec<PageButton> = (1..=total_pages)
        .map(|num| PageButton {
            num,
            is_active: num == page,
        })
        .collect();

    let pagination = Pagination {
        current_page: page,
        total_pages,
        limit,
        pages,
        query_params,
    };

    let sort_options = build_sort_options(&sort, &order);
    let content_type_label = "videos".to_string();

    let html = HomePage {
        username: session_user.clone().unwrap_or_default(),
        logged_in,
        videos: video_items,
        pagination,
        total_count: total,
        search_query,
        sort_options,
        content_type_label,
        version: state.static_version.clone(),
    }
    .render()
    .expect("index.html should be valid");

    Ok(web::Html::new(html))
}

fn time_ago(created_at: &sea_orm::prelude::DateTime, now: ChronoDateTime<Utc>) -> String {
    let now_naive = now.naive_utc();
    let duration = now_naive - *created_at;
    let seconds = duration.num_seconds().max(0);

    if seconds < 60 {
        return format!("{} seconds ago", seconds);
    }
    let minutes = duration.num_minutes();
    if minutes < 60 {
        return format!("{} minutes ago", minutes);
    }
    let hours = duration.num_hours();
    if hours < 24 {
        return format!("{} hours ago", hours);
    }
    let days = duration.num_days();
    if days < 7 {
        if days == 1 {
            return "1 day ago".to_string();
        }
        return format!("{} days ago", days);
    }
    let weeks = days / 7;
    if weeks < 5 {
        return format!("{} weeks ago", weeks);
    }
    let months = days / 30;
    if months < 12 {
        return format!("{} months ago", months);
    }
    let years = days / 365;
    format!("{} years ago", years)
}

// ---- upload handlers ----

#[derive(Template)]
#[template(path = "upload-video.html")]
struct UploadVideoPage {
    username: String,
    logged_in: bool,
    version: String,
}

#[derive(Template)]
#[template(path = "upload-gallery.html")]
struct UploadGalleryPage {
    username: String,
    logged_in: bool,
    version: String,
}

pub async fn upload_video(session: Session, state: web::Data<AppState>) -> Result<impl Responder> {
    let session_user = auth::get_session_user(&session, &state.conn).await;
    let logged_in = session_user.is_some();
    let html = UploadVideoPage {
        username: session_user.unwrap_or_default(),
        logged_in,
        version: state.static_version.clone(),
    }
    .render()
    .expect("upload-video.html should be valid");
    Ok(web::Html::new(html))
}

pub async fn upload_gallery(
    session: Session,
    state: web::Data<AppState>,
) -> Result<impl Responder> {
    let session_user = auth::get_session_user(&session, &state.conn).await;
    let logged_in = session_user.is_some();
    let html = UploadGalleryPage {
        username: session_user.unwrap_or_default(),
        logged_in,
        version: state.static_version.clone(),
    }
    .render()
    .expect("upload-gallery.html should be valid");
    Ok(web::Html::new(html))
}
