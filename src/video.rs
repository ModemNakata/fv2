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
    has_purchased: bool,
    free_preview_duration_s: String,
    duration_formatted: String,
    duration_human: String,
    source_quality: Option<String>,
    price_dollars: String,
    version: String,
    is_favourited: bool,
    payment_modal_title: String,
    payment_modal_desc: String,
}

pub async fn redirect_to_home() -> Result<impl Responder> {
    Ok(HttpResponse::Found()
        .insert_header(("Location", "/"))
        .finish())
}

/// Legacy UUID URL — permanent redirect to the slug-based canonical URL.
pub async fn video_by_uuid(
    session: Session,
    state: web::Data<AppState>,
    content_id: web::Path<Uuid>,
) -> Result<HttpResponse, actix_web::Error> {
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
    let ready_and_visible = content.status == ContentStatus::Ready
        && (is_uploader || content.visibility == ContentVisibility::Public);

    if ready_and_visible {
        let slug = crate::slug::ensure_slug(&state.conn, &content)
            .await
            .map_err(actix_web::error::ErrorInternalServerError)?;

        Ok(HttpResponse::MovedPermanently()
            .insert_header(("Location", format!("/v/{slug}")))
            .finish())
    } else {
        render_video(session, state, content).await
    }
}

/// Canonical slug URL for a video page.
pub async fn video_by_slug(
    session: Session,
    state: web::Data<AppState>,
    slug: web::Path<String>,
) -> Result<HttpResponse, actix_web::Error> {
    let slug = slug.into_inner();

    let content = ContentItems::find()
        .filter(crate::entity::content_items::Column::Slug.eq(&slug))
        .one(&state.conn)
        .await
        .map_err(actix_web::error::ErrorInternalServerError)?
        .ok_or_else(|| actix_web::error::ErrorNotFound("Video not found"))?;

    render_video(session, state, content).await
}

async fn render_video(
    session: Session,
    state: web::Data<AppState>,
    content: crate::entity::content_items::Model,
) -> Result<HttpResponse, actix_web::Error> {
    let session_user = auth::get_session_user(&session, &state.conn).await;
    let logged_in = session_user.is_some();
    let content_id = content.id;

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

        let video_opt = Videos::find_by_id(content_id)
            .one(&state.conn)
            .await
            .map_err(actix_web::error::ErrorInternalServerError)?;

        let duration_secs = video_opt.as_ref().and_then(|v| v.duration_seconds).unwrap_or(0);
        let hours = duration_secs / 3600;
        let minutes = (duration_secs % 3600) / 60;
        let secs = duration_secs % 60;
        let duration_formatted = if hours > 0 {
            format!("{}:{:02}:{:02}", hours, minutes, secs)
        } else {
            format!("{}:{:02}", minutes, secs)
        };
        let duration_human = if hours > 0 {
            if minutes > 0 && secs > 0 {
                format!("{hours} hours, {minutes} minutes and {secs} seconds")
            } else if minutes > 0 {
                format!("{hours} hours and {minutes} minutes")
            } else if secs > 0 {
                format!("{hours} hours and {secs} seconds")
            } else {
                format!("{hours} hours")
            }
        } else if minutes > 0 {
            if secs > 0 {
                format!("{minutes} minutes and {secs} seconds")
            } else {
                format!("{minutes} minutes")
            }
        } else {
            format!("{secs} seconds")
        };

        let free_preview_duration_s = video_opt.as_ref().and_then(|v| v.free_preview_duration_s);
        let source_quality = video_opt.and_then(|v| v.source_quality);

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
            let mut formats = VideoFormats::find()
                .filter(video_formats::Column::VideoId.eq(content_id))
                .filter(video_formats::Column::StoragePath.is_not_null())
                .all(&state.conn)
                .await
                .map_err(actix_web::error::ErrorInternalServerError)?;

            formats.sort_by(|a, b| {
                let (_, ha) = parse_resolution(&a.resolution);
                let (_, hb) = parse_resolution(&b.resolution);
                hb.cmp(&ha)
            });

            let mut sources = Vec::with_capacity(formats.len());
            for f in &formats {
                let path = if is_free_preview {
                    f.free_preview_path.as_ref().or(f.storage_path.as_ref())
                } else {
                    f.storage_path.as_ref()
                };
                let url = match path {
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
            has_purchased,
            free_preview_duration_s: free_preview_duration_s.map(|s| format!("{s}s")).unwrap_or_default(),
            duration_formatted,
            payment_modal_title: "Unlock this Video".to_string(),
            payment_modal_desc: duration_human.clone(),
            duration_human,
            source_quality,
            price_dollars: format!("{:.2}", content.price_cents as f64 / 100.0),
            version: state.static_version.clone(),
            is_favourited,
        }
        .render()
        .expect("video.html should be valid");

        Ok(HttpResponse::Ok()
            .content_type("text/html; charset=utf-8")
            .body(html))
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

        Ok(HttpResponse::Ok()
            .content_type("text/html; charset=utf-8")
            .body(html))
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
