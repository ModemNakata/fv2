use actix_session::Session;
use actix_web::{HttpResponse, Responder, Result, web};
use askama::Template;
use chrono::Utc;
use sea_orm::*;
use uuid::Uuid;

use crate::AppState;
use crate::auth;
use crate::entity::prelude::*;
use crate::entity::sea_orm_active_enums::*;
use crate::entity::{content_items, images, user_favorites, users};
use crate::gallery;

// ---- Page template ----

#[derive(Template)]
#[template(path = "favorites.html")]
struct FavoritesPage {
    username: String,
    logged_in: bool,
    session_avatar_url: Option<String>,
    video_count: u64,
    gallery_count: u64,
    active_tab: String,
    version: String,
}

// ---- API templates (pre-rendered card HTML) ----

#[derive(Template)]
#[template(path = "components/fav-video-card.html")]
struct FavVideoCardTemplate {
    v: FavVideoItem,
}

#[derive(Template)]
#[template(path = "components/fav-gallery-card.html")]
struct FavGalleryCardTemplate {
    g: FavGalleryItem,
}

// ---- Shared item types ----

struct FavVideoItem {
    id: Uuid,
    title: String,
    views: String,
    _favourite_count: String,
    duration: String,
    time_ago: String,
    thumbnail_url: Option<String>,
    preview_url: Option<String>,
    uploader_avatar_url: Option<String>,
    uploader_display_name: String,
    uploader_username: String,
    hue: u32,
}

struct FavGalleryItem {
    id: Uuid,
    title: String,
    image_count: usize,
    thumbnail_url: Option<String>,
    views: String,
    _favourite_count: String,
    time_ago: String,
    uploader_avatar_url: Option<String>,
    uploader_display_name: String,
    uploader_username: String,
}

// ---- Page handler ----

pub async fn favorites(
    session: Session,
    state: web::Data<AppState>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> Result<impl Responder> {
    let session_user = auth::get_session_user(&session, &state.conn).await;
    let logged_in = session_user.is_some();

    let user_id = auth::get_session_user_id(&session, &state.conn)
        .await
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("Not signed in"))?;

    // Count videos and galleries
    let favs = UserFavorites::find()
        .filter(user_favorites::Column::UserId.eq(user_id))
        .all(&state.conn)
        .await
        .map_err(actix_web::error::ErrorInternalServerError)?;

    let content_ids: Vec<Uuid> = favs.iter().map(|f| f.content_id).collect();

    let mut video_count = 0u64;
    let mut gallery_count = 0u64;

    if !content_ids.is_empty() {
        let type_counts = ContentItems::find()
            .select_only()
            .column(content_items::Column::Type)
            .filter(
                Condition::all()
                    .add(content_items::Column::Id.is_in(content_ids.clone()))
                    .add(content_items::Column::Status.eq(ContentStatus::Ready))
                    .add(content_items::Column::Visibility.eq(ContentVisibility::Public)),
            )
            .into_tuple::<(ContentType,)>()
            .all(&state.conn)
            .await
            .map_err(actix_web::error::ErrorInternalServerError)?;

        for (t,) in &type_counts {
            match t {
                ContentType::Video => video_count += 1,
                ContentType::ImageSet => gallery_count += 1,
            }
        }
    }

    let tab = query.get("tab").map(String::as_str).unwrap_or("");
    let active_tab = match tab {
        "videos" => "videos".to_string(),
        "galleries" => "galleries".to_string(),
        _ => {
            if gallery_count > video_count {
                "galleries".to_string()
            } else {
                "videos".to_string()
            }
        }
    };

    let html = FavoritesPage {
        username: session_user.as_ref().map(|u| u.username.clone()).unwrap_or_default(),
        logged_in,
        session_avatar_url: session_user.and_then(|u| u.avatar_url),
        video_count,
        gallery_count,
        active_tab,
        version: state.static_version.clone(),
    }
    .render()
    .expect("favorites.html should be valid");

    Ok(web::Html::new(html))
}

// ---- API handler (pre-rendered HTML chunks) ----

pub async fn api_favorites(
    session: Session,
    state: web::Data<AppState>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> HttpResponse {
    let user_id = match auth::get_session_user_id(&session, &state.conn).await {
        Some(id) => id,
        None => {
            return HttpResponse::Unauthorized().json(serde_json::json!({
                "ok": false, "error": "Not signed in"
            }));
        }
    };

    let tab = query.get("tab").map(String::as_str).unwrap_or("videos");
    let offset: u64 = query
        .get("offset")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let limit: u64 = query
        .get("limit")
        .and_then(|v| v.parse().ok())
        .unwrap_or(20)
        .min(50);

    // Get the user's favorite content IDs (respect created_at order)
    let favs = UserFavorites::find()
        .filter(user_favorites::Column::UserId.eq(user_id))
        .order_by_desc(user_favorites::Column::CreatedAt)
        .all(&state.conn)
        .await;

    let favs = match favs {
        Ok(f) => f,
        Err(e) => {
            log::error!("DB error querying favorites: {e}");
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "ok": false, "error": "Database error"
            }));
        }
    };

    let all_content_ids: Vec<Uuid> = favs.iter().map(|f| f.content_id).collect();

    if all_content_ids.is_empty() {
        return HttpResponse::Ok().json(serde_json::json!({
            "ok": true, "html": "", "has_more": false
        }));
    }

    // Fetch content items that are ready + public
    let content_list = match ContentItems::find()
        .filter(
            Condition::all()
                .add(content_items::Column::Id.is_in(all_content_ids.clone()))
                .add(content_items::Column::Status.eq(ContentStatus::Ready))
                .add(content_items::Column::Visibility.eq(ContentVisibility::Public)),
        )
        .all(&state.conn)
        .await
    {
        Ok(c) => c,
        Err(e) => {
            log::error!("DB error querying content: {e}");
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "ok": false, "error": "Database error"
            }));
        }
    };

    let content_map: std::collections::HashMap<Uuid, content_items::Model> =
        content_list.into_iter().map(|c| (c.id, c)).collect();

    // Filter IDs by type and preserve fav order
    let target_type = match tab {
        "videos" => ContentType::Video,
        _ => ContentType::ImageSet,
    };

    let type_ids: Vec<Uuid> = favs
        .iter()
        .filter_map(|f| {
            content_map
                .get(&f.content_id)
                .filter(|c| c.r#type == target_type)
                .map(|_| f.content_id)
        })
        .collect();

    let total = type_ids.len() as u64;
    let has_more = offset + limit < total;

    let page_ids: Vec<Uuid> = type_ids
        .into_iter()
        .skip(offset as usize)
        .take(limit as usize)
        .collect();

    if page_ids.is_empty() {
        return HttpResponse::Ok().json(serde_json::json!({
            "ok": true, "html": "", "has_more": false, "total": total
        }));
    }

    // Batch-fetch related data
    let users_map = fetch_users(&state, &content_map).await;
    let s3_base = build_s3_base();

    let html = match tab {
        "videos" => render_video_cards(&state, &page_ids, &content_map, &users_map, &s3_base).await,
        _ => render_gallery_cards(&state, &page_ids, &content_map, &users_map, &s3_base).await,
    };

    HttpResponse::Ok().json(serde_json::json!({
        "ok": true, "html": html, "has_more": has_more, "total": total
    }))
}

// ---- Helpers ----

async fn fetch_users(
    state: &web::Data<AppState>,
    content_map: &std::collections::HashMap<Uuid, content_items::Model>,
) -> std::collections::HashMap<Uuid, (String, String, Option<String>)> {
    let uploader_ids: Vec<Uuid> = content_map.values().map(|c| c.uploader_id).collect();
    if uploader_ids.is_empty() {
        return std::collections::HashMap::new();
    }
    Users::find()
        .filter(users::Column::Id.is_in(uploader_ids))
        .all(&state.conn)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|u| (u.id, (u.username, u.display_name, u.avatar_url)))
        .collect()
}

fn build_s3_base() -> String {
    let endpoint = std::env::var("PUBLIC_S3_ENDPOINT").unwrap_or_default();
    let bucket = std::env::var("S3_BUCKET").unwrap_or_default();
    if endpoint.is_empty() || bucket.is_empty() {
        String::new()
    } else {
        format!("{}/{}", endpoint.trim_end_matches('/'), bucket)
    }
}

async fn render_video_cards(
    state: &web::Data<AppState>,
    ids: &[Uuid],
    content_map: &std::collections::HashMap<Uuid, content_items::Model>,
    users_map: &std::collections::HashMap<Uuid, (String, String, Option<String>)>,
    s3_base: &str,
) -> String {
    let video_map: std::collections::HashMap<Uuid, crate::entity::videos::Model> = if ids.is_empty()
    {
        std::collections::HashMap::new()
    } else {
        Videos::find()
            .filter(crate::entity::videos::Column::ContentId.is_in(ids.to_vec()))
            .all(&state.conn)
            .await
            .unwrap_or_default()
            .into_iter()
            .map(|v| (v.content_id, v))
            .collect()
    };

    let now = Utc::now();
    let mut html = String::new();

    for id in ids {
        let content = match content_map.get(id) {
            Some(c) => c,
            None => continue,
        };
        let video_opt = video_map.get(id);
        let duration_secs = video_opt.and_then(|v| v.duration_seconds).unwrap_or(0);
        let hours = duration_secs / 3600;
        let minutes = (duration_secs % 3600) / 60;
        let secs = duration_secs % 60;
        let duration_str = if hours > 0 {
            format!("{}:{:02}:{:02}", hours, minutes, secs)
        } else {
            format!("{}:{:02}", minutes, secs)
        };
        let view_count = content.view_count;
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
        let thumbnail_url = content
            .thumbnail_url
            .clone()
            .filter(|k| !k.is_empty())
            .map(|key| format!("{}/{}", s3_base, key));
        let preview_url = video_opt
            .and_then(|v| v.preview_path.as_ref())
            .filter(|k| !k.is_empty())
            .map(|key| format!("{}/{}", s3_base, key));

        let item = FavVideoItem {
            id: content.id,
            title: content.title.clone(),
            views: crate::components::format_view_count(view_count),
            _favourite_count: content.favorite_count.to_string(),
            duration: duration_str,
            time_ago: gallery::time_ago(&content.created_at, now),
            thumbnail_url,
            preview_url,
            uploader_avatar_url,
            uploader_display_name: display_name,
            uploader_username: username,
            hue,
        };

        html.push_str(&FavVideoCardTemplate { v: item }.render().unwrap());
    }

    html
}

async fn render_gallery_cards(
    state: &web::Data<AppState>,
    ids: &[Uuid],
    content_map: &std::collections::HashMap<Uuid, content_items::Model>,
    users_map: &std::collections::HashMap<Uuid, (String, String, Option<String>)>,
    s3_base: &str,
) -> String {
    let image_set_map: std::collections::HashMap<Uuid, crate::entity::image_sets::Model> =
        if ids.is_empty() {
            std::collections::HashMap::new()
        } else {
            ImageSets::find()
                .filter(crate::entity::image_sets::Column::ContentId.is_in(ids.to_vec()))
                .all(&state.conn)
                .await
                .unwrap_or_default()
                .into_iter()
                .map(|is| (is.content_id, is))
                .collect()
        };

    let image_map: std::collections::HashMap<Uuid, Vec<images::Model>> = if ids.is_empty() {
        std::collections::HashMap::new()
    } else {
        let all = Images::find()
            .filter(images::Column::ImageSetId.is_in(ids.to_vec()))
            .order_by(images::Column::SortOrder, sea_orm::Order::Asc)
            .all(&state.conn)
            .await
            .unwrap_or_default();
        let mut map: std::collections::HashMap<Uuid, Vec<images::Model>> =
            std::collections::HashMap::new();
        for img in all {
            map.entry(img.image_set_id).or_default().push(img);
        }
        map
    };

    let now = Utc::now();
    let mut html = String::new();

    for id in ids {
        let content = match content_map.get(id) {
            Some(c) => c,
            None => continue,
        };
        let image_set = image_set_map.get(id);
        let imgs = image_map.get(id);
        let image_count = imgs.map(|v| v.len()).unwrap_or(0);
        let thumbnail_url = image_set
            .and_then(|is| is.preview_path.as_ref())
            .or_else(|| {
                imgs.and_then(|imgs| imgs.first())
                    .map(|img| img.storage_path.as_ref().unwrap_or(&img.orig_storage_path))
            })
            .map(|path| format!("{}/{}", s3_base, path));
        let view_count = content.view_count;
        let (username, display_name, uploader_avatar_url) = users_map
            .get(&content.uploader_id)
            .cloned()
            .unwrap_or_else(|| ("?".to_string(), "?".to_string(), None));

        let item = FavGalleryItem {
            id: content.id,
            title: content.title.clone(),
            image_count,
            thumbnail_url,
            views: crate::components::format_view_count(view_count),
            _favourite_count: content.favorite_count.to_string(),
            time_ago: gallery::time_ago(&content.created_at, now),
            uploader_avatar_url,
            uploader_display_name: display_name,
            uploader_username: username,
        };

        html.push_str(&FavGalleryCardTemplate { g: item }.render().unwrap());
    }

    html
}
