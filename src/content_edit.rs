use actix_session::Session;
use actix_web::{HttpResponse, web};
use askama::Template;
use sea_orm::{ActiveModelTrait, EntityTrait, Set};
use serde::Deserialize;
use uuid::Uuid;

use crate::AppState;
use crate::auth;
use crate::entity::prelude::*;
use crate::entity::content_items;

#[derive(Template)]
#[template(path = "content-edit.html")]
struct ContentEditPage {
    username: String,
    logged_in: bool,
    session_avatar_url: Option<String>,
    content_id: Uuid,
    content_title: String,
    content_description: Option<String>,
    content_type_label: String,
    version: String,
}

pub async fn edit_page(
    session: Session,
    state: web::Data<AppState>,
    content_id: web::Path<Uuid>,
) -> HttpResponse {
    let session_user = auth::get_session_user(&session, &state.conn).await;
    let logged_in = session_user.is_some();

    let user = match auth::require_user(&session, &state.conn).await {
        Ok(u) => u,
        Err(resp) => return resp,
    };

    let content_id = content_id.into_inner();

    let content = match ContentItems::find_by_id(content_id)
        .one(&state.conn)
        .await
    {
        Ok(Some(c)) => c,
        Ok(None) => {
            return HttpResponse::NotFound().body("Content not found");
        }
        Err(e) => {
            log::error!("DB error fetching content: {e}");
            return HttpResponse::InternalServerError().body("Something went wrong");
        }
    };

    if content.uploader_id != user.id {
        return HttpResponse::Forbidden().body("You don't own this content");
    }

    let content_type_label = match content.r#type {
        crate::entity::sea_orm_active_enums::ContentType::Video => "Video",
        crate::entity::sea_orm_active_enums::ContentType::ImageSet => "Gallery",
    }
    .to_string();

    let html = ContentEditPage {
        username: session_user
            .as_ref()
            .map(|u| u.username.clone())
            .unwrap_or_default(),
        logged_in,
        session_avatar_url: session_user.and_then(|u| u.avatar_url),
        content_id,
        content_title: content.title,
        content_description: content.description,
        content_type_label,
        version: state.static_version.clone(),
    }
    .render()
    .expect("content-edit.html should be valid");

    HttpResponse::Ok().body(html)
}

#[derive(Deserialize)]
pub struct EditContentRequest {
    title: Option<String>,
    description: Option<String>,
}

#[derive(serde::Serialize)]
struct EditContentResponse {
    ok: bool,
    error: Option<String>,
}

pub async fn update_content(
    session: Session,
    state: web::Data<AppState>,
    content_id: web::Path<Uuid>,
    body: web::Json<EditContentRequest>,
) -> HttpResponse {
    let user = match auth::require_user(&session, &state.conn).await {
        Ok(u) => u,
        Err(resp) => return resp,
    };

    let content_id = content_id.into_inner();

    let content = match ContentItems::find_by_id(content_id)
        .one(&state.conn)
        .await
    {
        Ok(Some(c)) => c,
        Ok(None) => {
            return HttpResponse::NotFound().json(EditContentResponse {
                ok: false,
                error: Some("Content not found".to_string()),
            });
        }
        Err(e) => {
            log::error!("DB error fetching content: {e}");
            return HttpResponse::InternalServerError().json(EditContentResponse {
                ok: false,
                error: Some("Something went wrong".to_string()),
            });
        }
    };

    if content.uploader_id != user.id {
        return HttpResponse::Forbidden().json(EditContentResponse {
            ok: false,
            error: Some("You don't own this content".to_string()),
        });
    }

    let mut active: content_items::ActiveModel = content.into();

    if let Some(ref title) = body.title {
        let trimmed = title.trim();
        if trimmed.is_empty() {
            return HttpResponse::BadRequest().json(EditContentResponse {
                ok: false,
                error: Some("Title cannot be empty".to_string()),
            });
        }
        active.title = Set(trimmed.to_string());
        match crate::slug::unique_slug(&state.conn, trimmed, Some(content_id)).await {
            Ok(slug) => active.slug = Set(Some(slug)),
            Err(e) => {
                log::error!("Failed to generate slug: {e}");
                return HttpResponse::InternalServerError().json(EditContentResponse {
                    ok: false,
                    error: Some("Failed to save changes".to_string()),
                });
            }
        }
    }

    if body.description.is_some() {
        let trimmed = body.description.as_ref().unwrap().trim().to_string();
        active.description = Set(if trimmed.is_empty() { None } else { Some(trimmed) });
    }

    if let Err(e) = active.update(&state.conn).await {
        log::error!("DB error updating content: {e}");
        return HttpResponse::InternalServerError().json(EditContentResponse {
            ok: false,
            error: Some("Failed to save changes".to_string()),
        });
    }

    HttpResponse::Ok().json(EditContentResponse {
        ok: true,
        error: None,
    })
}
