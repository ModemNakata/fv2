use actix_session::Session;
use actix_web::{Responder, Result, web};
use askama::Template;
use chrono::{DateTime as ChronoDateTime, Utc};
use sea_orm::*;
use uuid::Uuid;

use crate::auth;
use crate::entity::{content_items, users, videos, sea_orm_active_enums::*};
use crate::AppState;

#[derive(Template)]
#[template(path = "index.html")]
struct HomePage {
    logged_in: bool,
    videos: Vec<VideoItem>,
    pagination: Pagination,
}

struct VideoItem {
    id: Uuid,
    title: String,
    channel_name: String,
    views: String,
    duration: String,
    time_ago: String,
    thumbnail_url: Option<String>,
    uploader_initials: String,
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
}

#[derive(Template)]
#[template(path = "profile.html")]
struct ProfilePage {
    logged_in: bool,
}

pub async fn index(
    session: Session,
    state: web::Data<AppState>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> Result<impl Responder> {
    let logged_in = auth::get_session_user(&session, &state.conn).await.is_some();

    let limit: u32 = query.get("limit")
        .and_then(|v| v.parse().ok())
        .unwrap_or(20)
        .min(50);
    let page: u32 = query.get("page")
        .and_then(|v| v.parse().ok())
        .unwrap_or(1)
        .max(1);

    let offset = (page - 1) * limit;

    let total = content_items::Entity::find()
        .filter(content_items::Column::Status.eq(ContentStatus::Ready))
        .filter(content_items::Column::Type.eq(ContentType::Video))
        .filter(content_items::Column::Visibility.eq(ContentVisibility::Public))
        .count(&state.conn)
        .await
        .map_err(actix_web::error::ErrorInternalServerError)?;

    let total_pages = ((total as u32) + limit - 1) / limit;

    let items = content_items::Entity::find()
        .filter(content_items::Column::Status.eq(ContentStatus::Ready))
        .filter(content_items::Column::Type.eq(ContentType::Video))
        .filter(content_items::Column::Visibility.eq(ContentVisibility::Public))
        .order_by_desc(content_items::Column::CreatedAt)
        .limit(limit as u64)
        .offset(offset as u64)
        .find_also_related(videos::Entity)
        .all(&state.conn)
        .await
        .map_err(actix_web::error::ErrorInternalServerError)?;

    let uploader_ids: Vec<Uuid> = items.iter().map(|(c, _)| c.uploader_id).collect();
    let users_map: std::collections::HashMap<Uuid, String> = if uploader_ids.is_empty() {
        std::collections::HashMap::new()
    } else {
        users::Entity::find()
            .filter(users::Column::Id.is_in(uploader_ids))
            .all(&state.conn)
            .await
            .map_err(actix_web::error::ErrorInternalServerError)?
            .into_iter()
            .map(|u| (u.id, u.display_name))
            .collect()
    };

    let now = Utc::now();

    let video_items: Vec<VideoItem> = items
        .into_iter()
        .map(|(content, video_opt)| {
            let duration_secs = video_opt.as_ref()
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

            let view_count = video_opt.as_ref().map(|v| v.view_count).unwrap_or(0);
            let views_str = format_view_count(view_count);

            let channel_name = users_map
                .get(&content.uploader_id)
                .cloned()
                .unwrap_or_else(|| "Unknown".to_string());

            let initials = channel_name
                .chars()
                .next()
                .map(|c| c.to_uppercase().to_string())
                .unwrap_or_else(|| "?".to_string());

            let hue = (content.id.to_string().bytes().fold(0u32, |acc, b| acc.wrapping_add(b as u32)) * 37) % 360;

            let time_ago_str = time_ago(&content.created_at, now);

            VideoItem {
                id: content.id,
                title: content.title,
                channel_name,
                views: views_str,
                duration: duration_str,
                time_ago: time_ago_str,
                thumbnail_url: content.thumbnail_url,
                uploader_initials: initials,
                hue,
            }
        })
        .collect();

    let pages: Vec<PageButton> = (1..=total_pages)
        .map(|num| PageButton { num, is_active: num == page })
        .collect();

    let pagination = Pagination {
        current_page: page,
        total_pages,
        limit,
        pages,
    };

    let html = HomePage {
        logged_in,
        videos: video_items,
        pagination,
    }
    .render()
    .expect("index.html should be valid");

    Ok(web::Html::new(html))
}

fn format_view_count(count: i64) -> String {
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

// ---- profile, upload_video, upload_gallery handlers (unchanged) ----

pub async fn profile(session: Session, state: web::Data<AppState>) -> Result<impl Responder> {
    let logged_in = auth::get_session_user(&session, &state.conn).await.is_some();
    let html = ProfilePage { logged_in }.render().expect("profile.html should be valid");
    Ok(web::Html::new(html))
}

#[derive(Template)]
#[template(path = "upload-video.html")]
struct UploadVideoPage {
    logged_in: bool,
}

#[derive(Template)]
#[template(path = "upload-gallery.html")]
struct UploadGalleryPage {
    logged_in: bool,
}

pub async fn upload_video(session: Session, state: web::Data<AppState>) -> Result<impl Responder> {
    let logged_in = auth::get_session_user(&session, &state.conn).await.is_some();
    let html = UploadVideoPage { logged_in }.render().expect("upload-video.html should be valid");
    Ok(web::Html::new(html))
}

pub async fn upload_gallery(session: Session, state: web::Data<AppState>) -> Result<impl Responder> {
    let logged_in = auth::get_session_user(&session, &state.conn).await.is_some();
    let html = UploadGalleryPage { logged_in }.render().expect("upload-gallery.html should be valid");
    Ok(web::Html::new(html))
}
