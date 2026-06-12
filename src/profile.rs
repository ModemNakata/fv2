use actix_session::Session;
use actix_web::{HttpResponse, web};
use askama::Template;
use sea_orm::*;
use uuid::Uuid;

use crate::AppState;
use crate::auth;
use crate::entity::sea_orm_active_enums::*;
use crate::entity::{content_items, image_sets, images, users, videos};
use crate::gallery;

#[derive(Template)]
#[template(path = "profile.html")]
struct ProfilePage {
    username: Option<String>,
    logged_in: bool,
    is_owner: bool,
    display_name: String,
    handle: String,
    avatar_initial: String,
    videos: Vec<ProfileVideo>,
    galleries: Vec<ProfileGallery>,
}

struct ProfileVideo {
    id: Uuid,
    title: String,
    thumbnail_url: Option<String>,
    duration: String,
    views: String,
    time_ago: String,
    hue: u32,
}

struct ProfileGallery {
    id: Uuid,
    title: String,
    thumbnail_url: Option<String>,
    image_count: usize,
    views: String,
    time_ago: String,
}

pub async fn user_profile(
    session: Session,
    state: web::Data<AppState>,
    username: web::Path<String>,
) -> HttpResponse {
    let session_user = auth::get_session_user(&session, &state.conn).await;
    let logged_in = session_user.is_some();

    let profile_username = username.into_inner();
    let is_owner = session_user.as_deref() == Some(&profile_username);

    let user = match users::Entity::find()
        .filter(users::Column::Username.eq(&profile_username))
        .one(&state.conn)
        .await
    {
        Ok(Some(u)) => u,
        Ok(None) => return HttpResponse::NotFound().body("User not found"),
        Err(e) => {
            log::error!("DB error fetching user: {e}");
            return HttpResponse::InternalServerError().body("Database error");
        }
    };

    let avatar_initial = user
        .display_name
        .chars()
        .next()
        .map(|c| c.to_uppercase().to_string())
        .unwrap_or_else(|| "?".to_string());

    let s3_endpoint = std::env::var("PUBLIC_S3_ENDPOINT").unwrap_or_default();
    let s3_bucket = std::env::var("S3_BUCKET").unwrap_or_default();
    let s3_base = if s3_endpoint.is_empty() || s3_bucket.is_empty() {
        String::new()
    } else {
        format!("{}/{}", s3_endpoint.trim_end_matches('/'), s3_bucket)
    };

    let now = chrono::Utc::now();

    // ---- videos ----
    let video_items = content_items::Entity::find()
        .filter(content_items::Column::UploaderId.eq(user.id))
        .filter(content_items::Column::Type.eq(ContentType::Video))
        .filter(content_items::Column::Status.eq(ContentStatus::Ready))
        .filter(content_items::Column::Visibility.eq(ContentVisibility::Public))
        .order_by_desc(content_items::Column::CreatedAt)
        .find_also_related(videos::Entity)
        .all(&state.conn)
        .await
        .unwrap_or_default();

    let profile_videos: Vec<ProfileVideo> = video_items
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

            let view_count = video_opt.as_ref().map(|v| v.view_count).unwrap_or(0);

            let hue = (content
                .id
                .to_string()
                .bytes()
                .fold(0u32, |acc, b| acc.wrapping_add(b as u32))
                * 37)
                % 360;

            let thumbnail_url = content
                .thumbnail_url
                .filter(|k| !k.is_empty())
                .map(|key| format!("{}/{}", s3_base, key));

            ProfileVideo {
                id: content.id,
                title: content.title,
                thumbnail_url,
                duration: duration_str,
                views: gallery::format_view_count(view_count),
                time_ago: gallery::time_ago(&content.created_at, now),
                hue,
            }
        })
        .collect();

    // ---- galleries ----
    let gallery_items = content_items::Entity::find()
        .filter(content_items::Column::UploaderId.eq(user.id))
        .filter(content_items::Column::Type.eq(ContentType::ImageSet))
        .filter(content_items::Column::Status.eq(ContentStatus::Ready))
        .filter(content_items::Column::Visibility.eq(ContentVisibility::Public))
        .order_by_desc(content_items::Column::CreatedAt)
        .all(&state.conn)
        .await
        .unwrap_or_default();

    let gallery_ids: Vec<Uuid> = gallery_items.iter().map(|c| c.id).collect();

    let image_set_map: std::collections::HashMap<Uuid, image_sets::Model> = if !gallery_ids.is_empty() {
        let all = image_sets::Entity::find()
            .filter(image_sets::Column::ContentId.is_in(gallery_ids.clone()))
            .all(&state.conn)
            .await
            .unwrap_or_default();
        let mut map = std::collections::HashMap::new();
        for img_set in all {
            map.insert(img_set.content_id, img_set);
        }
        map
    } else {
        std::collections::HashMap::new()
    };

    let image_map: std::collections::HashMap<Uuid, Vec<images::Model>> = if !gallery_ids.is_empty() {
        let all = images::Entity::find()
            .filter(images::Column::ImageSetId.is_in(gallery_ids))
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
    } else {
        std::collections::HashMap::new()
    };

    let profile_galleries: Vec<ProfileGallery> = gallery_items
        .into_iter()
        .map(|content| {
            let image_set = image_set_map.get(&content.id);
            let imgs = image_map.get(&content.id);
            let image_count = imgs.map(|v| v.len()).unwrap_or(0);

            let thumbnail_url = image_set
                .and_then(|is| is.preview_path.as_ref())
                .or_else(|| {
                    imgs.and_then(|imgs| imgs.first())
                        .map(|img| img.storage_path.as_ref().unwrap_or(&img.orig_storage_path))
                })
                .map(|path| format!("{}/{}", s3_base, path));

            let view_count = image_set.map(|is| is.view_count).unwrap_or(0);

            ProfileGallery {
                id: content.id,
                title: content.title,
                thumbnail_url,
                image_count,
                views: gallery::format_view_count(view_count),
                time_ago: gallery::time_ago(&content.created_at, now),
            }
        })
        .collect();

    let html = ProfilePage {
        username: session_user,
        logged_in,
        is_owner,
        display_name: user.display_name,
        handle: user.username,
        avatar_initial,
        videos: profile_videos,
        galleries: profile_galleries,
    }
    .render()
    .expect("profile.html should be valid");

    HttpResponse::Ok().body(html)
}
