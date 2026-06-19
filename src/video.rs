use actix_session::Session;
use actix_web::{HttpResponse, Responder, Result, web};
use askama::Template;
use sea_orm::EntityTrait;
use uuid::Uuid;

use crate::auth;
use crate::components::ProcessingPage;
use crate::entity::prelude::*;
use crate::entity::sea_orm_active_enums::*;
use crate::AppState;

#[derive(Template)]
#[template(path = "video.html")]
struct VideoPage {
    username: String,
    logged_in: bool,
    video_title: String,
    video_description: Option<String>,
    source_url: String,
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

        let video = Videos::find_by_id(content_id)
            .one(&state.conn)
            .await
            .map_err(actix_web::error::ErrorInternalServerError)?
            .ok_or_else(|| actix_web::error::ErrorNotFound("Video not found"))?;

        let s3_endpoint = std::env::var("PUBLIC_S3_ENDPOINT").unwrap_or_default();
        let s3_bucket = std::env::var("S3_BUCKET").unwrap_or_default();
        let s3_base = if s3_endpoint.is_empty() || s3_bucket.is_empty() {
            String::new()
        } else {
            format!("{}/{}", s3_endpoint.trim_end_matches('/'), s3_bucket)
        };

        let is_paywalled = content.is_paywalled;
        let is_free_preview = is_paywalled && !is_uploader;

        let source_url = if is_free_preview {
            video.preview_path
                .map(|p| format!("{}/{}", s3_base, p))
                .unwrap_or_default()
        } else {
            format!("{}/videos/{}/master.m3u8", s3_base, content_id)
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
            username: session_user.unwrap_or_default(),
            logged_in,
            video_title: content.title,
            video_description: content.description,
            source_url,
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
            username: session_user.unwrap_or_default(),
            logged_in,
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
