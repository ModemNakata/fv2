use actix_session::Session;
use actix_web::{Responder, Result, web};
use askama::Template;
use chrono::{DateTime as ChronoDateTime, Utc};
use sea_orm::*;
use uuid::Uuid;

use crate::AppState;
use crate::auth;
use crate::entity::{content_items, image_sets, images, sea_orm_active_enums::*};

// ---- gallery listing (/gallery) ----

#[derive(Template)]
#[template(path = "galleries.html")]
struct GalleriesPage {
    logged_in: bool,
    galleries: Vec<GalleryCard>,
    pagination: GalleryPagination,
}

struct GalleryCard {
    id: Uuid,
    title: String,
    image_count: usize,
    thumbnail_url: Option<String>,
    views: String,
    time_ago: String,
}

struct GalleryPageButton {
    num: u32,
    is_active: bool,
}

struct GalleryPagination {
    current_page: u32,
    total_pages: u32,
    limit: u32,
    pages: Vec<GalleryPageButton>,
}

pub async fn index(
    session: Session,
    state: web::Data<AppState>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> Result<impl Responder> {
    let logged_in = auth::get_session_user(&session, &state.conn)
        .await
        .is_some();

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

    let total = content_items::Entity::find()
        .filter(content_items::Column::Status.eq(ContentStatus::Ready))
        .filter(content_items::Column::Type.eq(ContentType::ImageSet))
        .filter(content_items::Column::Visibility.eq(ContentVisibility::Public))
        .count(&state.conn)
        .await
        .map_err(actix_web::error::ErrorInternalServerError)?;

    let total_pages = ((total as u32) + limit - 1) / limit;

    let items = content_items::Entity::find()
        .filter(content_items::Column::Status.eq(ContentStatus::Ready))
        .filter(content_items::Column::Type.eq(ContentType::ImageSet))
        .filter(content_items::Column::Visibility.eq(ContentVisibility::Public))
        .order_by_desc(content_items::Column::CreatedAt)
        .limit(limit as u64)
        .offset(offset as u64)
        .all(&state.conn)
        .await
        .map_err(actix_web::error::ErrorInternalServerError)?;

    let ids: Vec<Uuid> = items.iter().map(|c| c.id).collect();

    let image_set_map: std::collections::HashMap<Uuid, image_sets::Model> = if !ids.is_empty() {
        let all = image_sets::Entity::find()
            .filter(image_sets::Column::ContentId.is_in(ids.clone()))
            .all(&state.conn)
            .await
            .map_err(actix_web::error::ErrorInternalServerError)?;
        let mut map = std::collections::HashMap::new();
        for img_set in all {
            map.insert(img_set.content_id, img_set);
        }
        map
    } else {
        std::collections::HashMap::new()
    };

    let image_map: std::collections::HashMap<Uuid, Vec<images::Model>> = if !ids.is_empty() {
        let all = images::Entity::find()
            .filter(images::Column::ImageSetId.is_in(ids))
            .order_by(images::Column::SortOrder, sea_orm::Order::Asc)
            .all(&state.conn)
            .await
            .map_err(actix_web::error::ErrorInternalServerError)?;
        let mut map: std::collections::HashMap<Uuid, Vec<images::Model>> =
            std::collections::HashMap::new();
        for img in all {
            map.entry(img.image_set_id).or_default().push(img);
        }
        map
    } else {
        std::collections::HashMap::new()
    };

    let s3_endpoint = std::env::var("PUBLIC_S3_ENDPOINT").unwrap_or_default();
    let s3_bucket = std::env::var("S3_BUCKET").unwrap_or_default();
    let s3_base = if s3_endpoint.is_empty() || s3_bucket.is_empty() {
        String::new()
    } else {
        format!("{}/{}", s3_endpoint.trim_end_matches('/'), s3_bucket)
    };

    let now = Utc::now();

    let galleries: Vec<GalleryCard> = items
        .into_iter()
        .map(|content| {
            let image_set = image_set_map.get(&content.id);
            let images = image_map.get(&content.id);
            let image_count = images.map(|v| v.len()).unwrap_or(0);

            let thumbnail_url = image_set
                .and_then(|is| is.preview_path.as_ref())
                .or_else(|| {
                    images
                        .and_then(|imgs| imgs.first())
                        .map(|img| img.storage_path.as_ref().unwrap_or(&img.orig_storage_path))
                })
                .map(|path| format!("{}/{}", s3_base, path));

            let view_count = image_set.map(|is| is.view_count).unwrap_or(0);
            let views = format_view_count(view_count);
            let time_ago_str = time_ago(&content.created_at, now);

            GalleryCard {
                id: content.id,
                title: content.title,
                image_count,
                thumbnail_url,
                views,
                time_ago: time_ago_str,
            }
        })
        .collect();

    let pages: Vec<GalleryPageButton> = (1..=total_pages)
        .map(|num| GalleryPageButton {
            num,
            is_active: num == page,
        })
        .collect();

    let pagination = GalleryPagination {
        current_page: page,
        total_pages,
        limit,
        pages,
    };

    let html = GalleriesPage {
        logged_in,
        galleries,
        pagination,
    }
    .render()
    .expect("galleries.html should be valid");

    Ok(web::Html::new(html))
}

// ---- gallery detail (/gallery/{uuid}) ----

#[derive(Template)]
#[template(path = "gallery.html")]
struct GalleryPage {
    logged_in: bool,
    title: String,
    description: Option<String>,
    images: Vec<GalleryImage>,
}

struct GalleryImage {
    url: String,
    alt: String,
}

pub async fn gallery(
    session: Session,
    state: web::Data<AppState>,
    content_id: web::Path<Uuid>,
) -> Result<impl Responder> {
    let logged_in = auth::get_session_user(&session, &state.conn)
        .await
        .is_some();
    let content_id = content_id.into_inner();

    let content = content_items::Entity::find_by_id(content_id)
        .one(&state.conn)
        .await
        .map_err(actix_web::error::ErrorInternalServerError)?
        .ok_or_else(|| actix_web::error::ErrorNotFound("Gallery not found"))?;

    if content.r#type != ContentType::ImageSet
        || content.status != ContentStatus::Ready
        || content.visibility != ContentVisibility::Public
    {
        return Err(actix_web::error::ErrorNotFound("Gallery not found"));
    }

    let image_rows = images::Entity::find()
        .filter(images::Column::ImageSetId.eq(content_id))
        .order_by(images::Column::SortOrder, sea_orm::Order::Asc)
        .all(&state.conn)
        .await
        .map_err(actix_web::error::ErrorInternalServerError)?;

    let s3_endpoint = std::env::var("PUBLIC_S3_ENDPOINT").unwrap_or_default();
    let s3_bucket = std::env::var("S3_BUCKET").unwrap_or_default();
    let s3_base = if s3_endpoint.is_empty() || s3_bucket.is_empty() {
        String::new()
    } else {
        format!("{}/{}", s3_endpoint.trim_end_matches('/'), s3_bucket)
    };

    let images: Vec<GalleryImage> = image_rows
        .into_iter()
        .map(|img| GalleryImage {
            url: format!("{}/{}", s3_base, img.storage_path.as_ref().unwrap_or(&img.orig_storage_path)),
            alt: img.alt_text.unwrap_or(img.original_name),
        })
        .collect();

    let html = GalleryPage {
        logged_in,
        title: content.title,
        description: content.description,
        images,
    }
    .render()
    .expect("gallery.html should be valid");

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
