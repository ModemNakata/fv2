use actix_session::Session;
use actix_web::{Responder, Result, web};
use askama::Template;
use chrono::{DateTime as ChronoDateTime, Utc};
use sea_orm::*;
use uuid::Uuid;

use crate::AppState;
use crate::auth;
use crate::components::build_sort_options;
use crate::components::ProcessingPage;
use crate::components::SortOption;
use crate::entity::prelude::*;
use crate::entity::sea_orm_active_enums::*;
use crate::entity::{content_items, image_sets, images, users};

// ---- gallery listing (/gallery) ----

#[derive(Template)]
#[template(path = "galleries.html")]
struct GalleriesPage {
    username: String,
    logged_in: bool,
    session_avatar_url: Option<String>,
    galleries: Vec<GalleryCard>,
    pagination: GalleryPagination,
    total_count: u64,
    search_query: String,
    sort_options: Vec<SortOption>,
    content_type_label: String,
    version: String,
}

struct GalleryCard {
    id: Uuid,
    title: String,
    image_count: usize,
    thumbnail_url: Option<String>,
    views: String,
    favourite_count: String,
    time_ago: String,
    uploader_avatar_url: Option<String>,
    uploader_display_name: String,
    uploader_username: String,
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
    query_params: String,
    base_path: String,
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
        .add(content_items::Column::Type.eq(ContentType::ImageSet))
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
        .all(&state.conn)
        .await
        .map_err(actix_web::error::ErrorInternalServerError)?;

    let ids: Vec<Uuid> = items.iter().map(|c| c.id).collect();

    let image_set_map: std::collections::HashMap<Uuid, image_sets::Model> = if !ids.is_empty() {
        let all = ImageSets::find()
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
        let all = Images::find()
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

    let uploader_ids: Vec<Uuid> = items.iter().map(|c| c.uploader_id).collect();
    let users_map: std::collections::HashMap<Uuid, (String, String, Option<String>)> = if uploader_ids.is_empty() {
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

    let now = Utc::now();

    let mut galleries = Vec::with_capacity(items.len());
    for content in items {
        let image_set = image_set_map.get(&content.id);
        let images = image_map.get(&content.id);
        let image_count = images.map(|v| v.len()).unwrap_or(0);

        let thumb_key = image_set
            .and_then(|is| is.preview_path.clone())
            .or_else(|| {
                images
                    .and_then(|imgs| imgs.first())
                    .map(|img| img.storage_path.clone().unwrap_or(img.orig_storage_path.clone()))
            });

        let thumbnail_url = state
            .s3
            .presigned_opt(thumb_key)
            .await
            .map_err(actix_web::error::ErrorInternalServerError)?;

        let views = crate::components::format_view_count(content.view_count);
        let favourite_count = content.favorite_count.to_string();
        let time_ago_str = time_ago(&content.created_at, now);

        let (username, display_name, avatar_url) = users_map
            .get(&content.uploader_id)
            .cloned()
            .unwrap_or_else(|| ("?".to_string(), "?".to_string(), None));

        galleries.push(GalleryCard {
            id: content.id,
            title: content.title,
            image_count,
            thumbnail_url,
            views,
            favourite_count,
            time_ago: time_ago_str,
            uploader_avatar_url: avatar_url,
            uploader_display_name: display_name,
            uploader_username: username,
        });
    }

    let mut query_params = String::new();
    if !search_query.is_empty() {
        query_params.push_str("&q=");
        query_params.push_str(&url_encode(&search_query));
    }
    query_params.push_str("&sort=");
    query_params.push_str(&sort);
    query_params.push_str("&order=");
    query_params.push_str(&order);

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
        query_params,
        base_path: "/gallery".to_string(),
    };

    let sort_options = build_sort_options(&sort, &order);
    let content_type_label = "galleries".to_string();

    let html = GalleriesPage {
        username: session_user.as_ref().map(|u| u.username.clone()).unwrap_or_default(),
        logged_in,
        session_avatar_url: session_user.and_then(|u| u.avatar_url),
        galleries,
        pagination,
        total_count: total,
        search_query,
        sort_options,
        content_type_label,
        version: state.static_version.clone(),
    }
    .render()
    .expect("galleries.html should be valid");

    Ok(web::Html::new(html))
}

// ---- gallery detail (/gallery/{uuid}) ----

#[derive(Template)]
#[template(path = "gallery.html")]
struct GalleryPage {
    username: String,
    logged_in: bool,
    session_avatar_url: Option<String>,
    title: String,
    description: Option<String>,
    uploader_username: String,
    uploader_display_name: String,
    uploader_avatar_url: Option<String>,
    created_at: String,
    images: Vec<GalleryImage>,
    view_count: String,
    favourite_count: String,
    is_uploader: bool,
    content_id: Uuid,
    is_paywalled: bool,
    is_free_preview: bool,
    has_purchased: bool,
    price_dollars: String,
    unblurred_count: i32,
    total_image_count: usize,
    version: String,
    is_favourited: bool,
    payment_modal_title: String,
    payment_modal_desc: String,
}

struct GalleryImage {
    url: String,
    alt: String,
    is_blurred: bool,
}

pub async fn gallery(
    session: Session,
    state: web::Data<AppState>,
    content_id: web::Path<Uuid>,
) -> Result<impl Responder> {
    let session_user = auth::get_session_user(&session, &state.conn).await;
    let logged_in = session_user.is_some();
    let content_id = content_id.into_inner();

    let content = ContentItems::find_by_id(content_id)
        .one(&state.conn)
        .await
        .map_err(actix_web::error::ErrorInternalServerError)?
        .ok_or_else(|| actix_web::error::ErrorNotFound("Gallery not found"))?;

    if content.r#type != ContentType::ImageSet {
        return Err(actix_web::error::ErrorNotFound("Gallery not found"));
    }

    let session_user_id = auth::get_session_user_id(&session, &state.conn).await;
    let is_uploader = session_user_id == Some(content.uploader_id);

    if content.status == ContentStatus::Ready
        && (is_uploader || content.visibility == ContentVisibility::Public)
    {
        let uploader = Users::find_by_id(content.uploader_id)
            .one(&state.conn)
            .await
            .map_err(actix_web::error::ErrorInternalServerError)?
            .ok_or_else(|| actix_web::error::ErrorNotFound("Uploader not found"))?;

        let image_rows = Images::find()
            .filter(images::Column::ImageSetId.eq(content_id))
            .order_by(images::Column::SortOrder, sea_orm::Order::Asc)
            .all(&state.conn)
            .await
            .map_err(actix_web::error::ErrorInternalServerError)?;

        let image_set = ImageSets::find_by_id(content_id)
            .one(&state.conn)
            .await
            .map_err(actix_web::error::ErrorInternalServerError)?
            .ok_or_else(|| actix_web::error::ErrorNotFound("Gallery not found"))?;

        let is_paywalled = content.is_paywalled;
        let has_purchased = if let Some(uid) = session_user_id {
            UserPurchases::find_by_id((uid, content_id))
                .one(&state.conn)
                .await
                .map_err(actix_web::error::ErrorInternalServerError)?
                .is_some()
        } else {
            false
        };
        let is_free_preview = is_paywalled && !is_uploader && !has_purchased;
        let unblurred_count = image_set.unblurred_count.unwrap_or(0) as usize;

        let mut images = Vec::with_capacity(image_rows.len());
        for (i, img) in image_rows.into_iter().enumerate() {
            let key = if is_free_preview && i >= unblurred_count {
                img.blurred_storage_path
                    .or(img.storage_path)
                    .unwrap_or(img.orig_storage_path)
            } else {
                img.storage_path
                    .unwrap_or(img.orig_storage_path)
            };
            let url = state
                .s3
                .presigned(&key)
                .await
                .map_err(actix_web::error::ErrorInternalServerError)?;
            images.push(GalleryImage {
                url,
                alt: img.alt_text.unwrap_or(img.original_name),
                is_blurred: is_free_preview && i >= unblurred_count,
            });
        }

        let total_image_count = images.len();

        let is_favourited = if let Some(uid) = session_user_id {
            UserFavorites::find_by_id((uid, content_id))
                .one(&state.conn)
                .await
                .map_err(actix_web::error::ErrorInternalServerError)?
                .is_some()
        } else {
            false
        };

        let created_at = content.created_at.format("%b %e, %Y").to_string();

        let html = GalleryPage {
            username: session_user.as_ref().map(|u| u.username.clone()).unwrap_or_default(),
            logged_in,
            session_avatar_url: session_user.and_then(|u| u.avatar_url),
            title: content.title,
            description: content.description,
            uploader_username: uploader.username,
            uploader_display_name: uploader.display_name.clone(),
            uploader_avatar_url: uploader.avatar_url,
            created_at,
            images,
            view_count: crate::components::format_view_count(content.view_count),
            favourite_count: content.favorite_count.to_string(),
            is_uploader,
            content_id,
            is_paywalled,
            is_free_preview,
            has_purchased,
            price_dollars: format!("{:.2}", content.price_cents as f64 / 100.0),
            unblurred_count: image_set.unblurred_count.unwrap_or(0),
            total_image_count,
            payment_modal_title: "Unlock this Gallery".to_string(),
            payment_modal_desc: format!("{} images", total_image_count),
            version: state.static_version.clone(),
            is_favourited,
        }
        .render()
        .expect("gallery.html should be valid");

        Ok(web::Html::new(html))
    } else if is_uploader {
        let status_str = match content.status {
            ContentStatus::Uploading => "uploading",
            ContentStatus::Processing => "processing",
            ContentStatus::Failed => "failed",
            _ => "processing",
        };

        let html = ProcessingPage {
            username: session_user.as_ref().map(|u| u.username.clone()).unwrap_or_default(),
            logged_in,
            session_avatar_url: session_user.and_then(|u| u.avatar_url),
            title: content.title,
            content_type_label: "gallery".to_string(),
            content_status: status_str.to_string(),
            content_id,
            version: state.static_version.clone(),
        }
        .render()
        .expect("content-processing.html should be valid");

        Ok(web::Html::new(html))
    } else {
        Err(actix_web::error::ErrorNotFound("Gallery not found"))
    }
}

pub(crate) fn time_ago(created_at: &sea_orm::prelude::DateTime, now: ChronoDateTime<Utc>) -> String {
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
