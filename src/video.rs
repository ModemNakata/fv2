use actix_session::Session;
use actix_web::{HttpResponse, Responder, Result, web};
use askama::Template;
use sea_orm::EntityTrait;
use uuid::Uuid;

use crate::auth;
use crate::entity::{content_items, sea_orm_active_enums::*};
use crate::AppState;

#[derive(Template)]
#[template(path = "video.html")]
struct VideoPage {
    username: Option<String>,
    logged_in: bool,
    video_title: String,
    source_url: String,
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

    let content = content_items::Entity::find_by_id(content_id)
        .one(&state.conn)
        .await
        .map_err(actix_web::error::ErrorInternalServerError)?
        .ok_or_else(|| actix_web::error::ErrorNotFound("Video not found"))?;

    if content.r#type != ContentType::Video
        || content.status != ContentStatus::Ready
        || content.visibility != ContentVisibility::Public
    {
        return Err(actix_web::error::ErrorNotFound("Video not found"));
    }

    let s3_endpoint = std::env::var("PUBLIC_S3_ENDPOINT").unwrap_or_default();
    let s3_bucket = std::env::var("S3_BUCKET").unwrap_or_default();
    let source_url = if !s3_endpoint.is_empty() && !s3_bucket.is_empty() {
        format!(
            "{}/{}/videos/{}/master.m3u8",
            s3_endpoint.trim_end_matches('/'),
            s3_bucket,
            content_id,
        )
    } else {
        String::new()
    };

    let html = VideoPage {
        username: session_user.clone(),
        logged_in,
        video_title: content.title,
        source_url,
    }
    .render()
    .expect("video.html should be valid");

    Ok(web::Html::new(html))
}
