use actix_session::Session;
use actix_web::{HttpResponse, Responder, Result, web};
use askama::Template;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use uuid::Uuid;

use crate::AppState;
use crate::auth;
use crate::components::ProcessingPage;
use crate::entity::prelude::*;
use crate::entity::sea_orm_active_enums::*;
use crate::entity::video_formats;

#[derive(Template)]
#[template(path = "video.html")]
struct VideoPage {
    username: String,
    logged_in: bool,
    session_avatar_url: Option<String>,
    video_title: String,
    video_description: Option<String>,
    sources_json: String,
    uploader_username: String,
    uploader_display_name: String,
    uploader_avatar_url: Option<String>,
    created_at: String,
    view_count: String,
    favourite_count: String,
    is_uploader: bool,
    content_id: Uuid,
    is_paywalled: bool,
    is_free_preview: bool,
    price_dollars: String,
    version: String,
    is_favourited: bool,
}

pub async fn redirect_to_home() -> Result<impl Responder> {
    Ok(HttpResponse::Found()
        .insert_header(("Location", "/"))
        .finish())
}

pub async fn video(
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
        .ok_or_else(|| actix_web::error::ErrorNotFound("Video not found"))?;

    if content.r#type != ContentType::Video {
        return Err(actix_web::error::ErrorNotFound("Video not found"));
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

        let sources_json = {
            // HLS mode (can be revived):
            // format!("{}/videos/{}/master.m3u8", s3_base, content_id)
            let formats = VideoFormats::find()
                .filter(video_formats::Column::VideoId.eq(content_id))
                .filter(video_formats::Column::StoragePath.is_not_null())
                .all(&state.conn)
                .await
                .map_err(actix_web::error::ErrorInternalServerError)?;

            let mut sources = Vec::with_capacity(formats.len());
            for f in &formats {
                let url = match f.storage_path.as_ref() {
                    Some(p) => state
                        .s3
                        .presigned(p)
                        .await
                        .map_err(actix_web::error::ErrorInternalServerError)?,
                    None => String::new(),
                };
                let (width, height) = parse_resolution(&f.resolution);
                sources.push(serde_json::json!({
                    "src": url,
                    "type": mime_for_format(&f.format),
                    "width": width,
                    "height": height,
                }));
            }

            serde_json::to_string(&sources).unwrap_or_default()
        };

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

        let html = VideoPage {
            username: session_user
                .as_ref()
                .map(|u| u.username.clone())
                .unwrap_or_default(),
            logged_in,
            session_avatar_url: session_user.and_then(|u| u.avatar_url),
            video_title: content.title,
            video_description: content.description,
            sources_json,
            uploader_username: uploader.username,
            uploader_display_name: uploader.display_name,
            uploader_avatar_url: uploader.avatar_url,
            created_at,
            view_count: crate::components::format_view_count(content.view_count),
            favourite_count: content.favorite_count.to_string(),
            is_uploader,
            content_id,
            is_paywalled,
            is_free_preview,
            price_dollars: format!("{:.2}", content.price_cents as f64 / 100.0),
            version: state.static_version.clone(),
            is_favourited,
        }
        .render()
        .expect("video.html should be valid");

        Ok(web::Html::new(html))
    } else if is_uploader {
        let status_str = match content.status {
            ContentStatus::Uploading => "uploading",
            ContentStatus::Processing => "processing",
            ContentStatus::Failed => "failed",
            _ => "processing",
        };

        let html = ProcessingPage {
            username: session_user
                .as_ref()
                .map(|u| u.username.clone())
                .unwrap_or_default(),
            logged_in,
            session_avatar_url: session_user.and_then(|u| u.avatar_url),
            title: content.title,
            content_type_label: "video".to_string(),
            content_status: status_str.to_string(),
            content_id,
            version: state.static_version.clone(),
        }
        .render()
        .expect("content-processing.html should be valid");

        Ok(web::Html::new(html))
    } else {
        Err(actix_web::error::ErrorNotFound("Video not found"))
    }
}

/// Parse a "WxH" resolution string into (width, height).
/// Returns (0, 0) for unrecognized formats.
fn parse_resolution(res: &str) -> (u32, u32) {
    if let Some((w, h)) = res.split_once('x') {
        if let (Ok(w), Ok(h)) = (w.parse::<u32>(), h.parse::<u32>()) {
            return (w, h);
        }
    }
    // Fall back to label format (e.g. "1080p", "4K") — width unknown, use height as estimate
    let h = match res {
        "4K" | "2160p" => 2160,
        "1440p" | "2K" => 1440,
        "1080p" | "1080p60" => 1080,
        "720p" | "720p60" => 720,
        "480p" => 480,
        "360p" => 360,
        "240p" => 240,
        "144p" => 144,
        _ => 0,
    };
    (0, h)
}

/// Map a file format extension to its MIME type for the Vidstack source array.
fn mime_for_format(ext: &str) -> &'static str {
    match ext {
        // "webm" => "video/webm",
        // "mp4" => "video/mp4",
        // "ogg" => "video/ogg",
        // "m3u8" => "application/x-mpegurl",
        _ => "video/webm",
    }
}
