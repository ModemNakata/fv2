use actix_multipart::Multipart;
use actix_session::Session;
use actix_web::{HttpResponse, web};
use askama::Template;
use futures_util::StreamExt;
use sea_orm::{
    ActiveModelTrait, EntityTrait, QueryFilter, Set,
    sea_query::{Expr, Func},
};
use uuid::Uuid;

use crate::AppState;
use crate::auth;
use crate::entity::prelude::*;
use crate::entity::users;

#[derive(Template)]
#[template(path = "settings.html")]
struct SettingsPage {
    username: String,
    logged_in: bool,
    session_avatar_url: Option<String>,
    current_username: String,
    current_display_name: String,
    current_avatar_url: Option<String>,
    current_about_me: Option<String>,
    has_password: bool,
    version: String,
}

pub async fn settings_page(session: Session, state: web::Data<AppState>) -> HttpResponse {
    let session_user = auth::get_session_user(&session, &state.conn).await;
    let logged_in = session_user.is_some();

    let user = match auth::require_user(&session, &state.conn).await {
        Ok(u) => u,
        Err(resp) => return resp,
    };

    let html = SettingsPage {
        username: session_user
            .as_ref()
            .map(|u| u.username.clone())
            .unwrap_or_default(),
        logged_in,
        session_avatar_url: session_user.and_then(|u| u.avatar_url),
        current_username: user.username.clone(),
        current_display_name: user.display_name,
        current_avatar_url: user.avatar_url,
        current_about_me: user.about_me,
        has_password: user.password_hash != "__no_password__",
        version: state.static_version.clone(),
    }
    .render()
    .expect("settings.html should be valid");

    HttpResponse::Ok().body(html)
}

#[derive(serde::Serialize)]
struct SettingsResponse {
    ok: bool,
    error: Option<String>,
}

pub async fn update_settings(
    session: Session,
    state: web::Data<AppState>,
    mut payload: Multipart,
) -> HttpResponse {
    let user = match auth::require_user(&session, &state.conn).await {
        Ok(u) => u,
        Err(resp) => return resp,
    };

    let user_id = user.id;
    let original_username = user.username.clone();

    let mut username: Option<String> = None;
    let mut display_name: Option<String> = None;
    let mut about_me: Option<String> = None;
    let mut avatar_data: Option<Vec<u8>> = None;
    let mut avatar_filename: Option<String> = None;
    let mut remove_avatar = false;

    while let Some(Ok(mut field)) = payload.next().await {
        let cd = field
            .content_disposition()
            .expect("missing content disposition")
            .clone();
        let name = cd.get_name().unwrap_or("").to_string();

        match name.as_str() {
            "username" => {
                let mut data = Vec::new();
                while let Some(Ok(chunk)) = field.next().await {
                    data.extend_from_slice(&chunk);
                }
                let val = String::from_utf8(data).unwrap_or_default();
                if !val.is_empty() {
                    username = Some(val);
                }
            }
            "display_name" => {
                let mut data = Vec::new();
                while let Some(Ok(chunk)) = field.next().await {
                    data.extend_from_slice(&chunk);
                }
                let val = String::from_utf8(data).unwrap_or_default();
                if !val.is_empty() {
                    display_name = Some(val);
                }
            }
            "about_me" => {
                let mut data = Vec::new();
                while let Some(Ok(chunk)) = field.next().await {
                    data.extend_from_slice(&chunk);
                }
                about_me = Some(String::from_utf8(data).unwrap_or_default());
            }
            "avatar" => {
                let mut data = Vec::new();
                while let Some(Ok(chunk)) = field.next().await {
                    data.extend_from_slice(&chunk);
                }
                if !data.is_empty() {
                    avatar_data = Some(data);
                    avatar_filename = cd.get_filename().map(|s| s.to_string());
                }
            }
            "remove_avatar" => {
                let mut data = Vec::new();
                while let Some(Ok(chunk)) = field.next().await {
                    data.extend_from_slice(&chunk);
                }
                let val = String::from_utf8(data).unwrap_or_default();
                if val == "true" {
                    remove_avatar = true;
                }
            }
            _ => {}
        }
    }

    let current_avatar_url = user.avatar_url.clone();
    let mut user: users::ActiveModel = user.into();

    if let Some(ref new_username) = username {
        if let Err(e) = auth::validate_username(new_username) {
            return HttpResponse::BadRequest().json(SettingsResponse {
                ok: false,
                error: Some(e.to_string()),
            });
        }

        if new_username.to_lowercase() != original_username.to_lowercase() {
            let existing = Users::find()
                .filter(
                    Expr::expr(Func::lower(Expr::col(users::Column::Username)))
                        .eq(new_username.to_lowercase()),
                )
                .one(&state.conn)
                .await;

            match existing {
                Ok(Some(_)) => {
                    return HttpResponse::Conflict().json(SettingsResponse {
                        ok: false,
                        error: Some("Username unavailable".to_string()),
                    });
                }
                Err(e) => {
                    log::error!("DB error checking username: {e}");
                    return HttpResponse::InternalServerError().json(SettingsResponse {
                        ok: false,
                        error: Some("Something went wrong".to_string()),
                    });
                }
                Ok(None) => {}
            }
        }

        user.username = Set(new_username.clone());
    }

    if let Some(ref name) = display_name {
        user.display_name = Set(name.clone());
    }

    if let Some(about) = about_me {
        let trimmed = about.trim().to_string();
        user.about_me = Set(if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        });
    }

    if remove_avatar {
        if let Some(ref url) = current_avatar_url {
            let path = url.trim_start_matches('/');
            let _ = std::fs::remove_file(path);
            // TEMPORARY: don't delete original avatar on `avatar remove`
            // ^ x
            if let Some(filename) = path.rsplit_once('/').map(|(_, f)| f) {
                let _ = std::fs::remove_file(format!("static/avatars/original-{filename}"));
            }
        }
        user.avatar_url = Set(None);
        user.original_avatar_path = Set(None);
        user.original_avatar_name = Set(None);
    } else if let Some(data) = avatar_data {
        if let Some(ref url) = current_avatar_url {
            let path = url.trim_start_matches('/');
            let _ = std::fs::remove_file(path);
            // X -> don't delete original avatar on avatar update
            if let Some(filename) = path.rsplit_once('/').map(|(_, f)| f) {
                let _ = std::fs::remove_file(format!("static/avatars/original-{filename}"));
            }
        }
        match process_avatar(&data, user_id, &avatar_filename) {
            Ok((avatar_url, original_path)) => {
                user.avatar_url = Set(Some(avatar_url));
                user.original_avatar_path = Set(original_path);
                user.original_avatar_name = Set(avatar_filename);
            }
            Err(e) => {
                return HttpResponse::BadRequest().json(SettingsResponse {
                    ok: false,
                    error: Some(e),
                });
            }
        }
    }

    if let Err(e) = user.update(&state.conn).await {
        log::error!("DB error updating user: {e}");
        return HttpResponse::InternalServerError().json(SettingsResponse {
            ok: false,
            error: Some("Failed to save changes".to_string()),
        });
    }

    HttpResponse::Ok().json(SettingsResponse {
        ok: true,
        error: None,
    })
}

fn process_avatar(
    data: &[u8],
    user_id: Uuid,
    original_filename: &Option<String>,
) -> Result<(String, Option<String>), String> {
    let img = image::load_from_memory(data).map_err(|e| format!("Invalid image: {e}"))?;
    let resized = img.resize_to_fill(256, 256, image::imageops::FilterType::Lanczos3); // 128 // 512 | Lanczos3 ???

    // using UNIX TIMESTAMP assuming user can't change profile picture twice in a second...
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let avif_filename = format!("{user_id}_{now}.avif");
    let avif_path = format!("static/avatars/{avif_filename}");

    let mut output =
        std::fs::File::create(&avif_path).map_err(|e| format!("Failed to create file: {e}"))?;
    resized
        .write_to(&mut output, image::ImageFormat::Avif)
        .map_err(|e| format!("AVIF encoding failed: {e}"))?;

    // Save original unprocessed image with its original extension
    let original_ext = original_filename
        .as_ref()
        .and_then(|name| std::path::Path::new(name).extension())
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_lowercase())
        .filter(|ext| !ext.is_empty())
        .unwrap_or_else(|| "png".to_string());
    let original_file = format!("original-{user_id}_{now}.{original_ext}");
    let original_path = format!("static/avatars/{original_file}");

    // saving original profile picutre | store it to change later if needed
    let mut original_output = std::fs::File::create(&original_path)
        .map_err(|e| format!("Failed to create original file: {e}"))?;
    std::io::copy(&mut std::io::Cursor::new(data), &mut original_output)
        .map_err(|e| format!("Failed to write original image: {e}"))?;

    Ok((
        format!("/static/avatars/{avif_filename}"),
        Some(format!("/static/avatars/{original_file}")),
    ))
}
// ? (???) (?)
