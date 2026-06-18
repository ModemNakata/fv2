use actix_session::Session;
use actix_web::{HttpResponse, web};
use sea_orm::*;
use uuid::Uuid;

use crate::auth;
use crate::entity::prelude::*;
use crate::entity::{content_items, user_favorites};
use crate::AppState;

pub async fn toggle_favourite(
    session: Session,
    state: web::Data<AppState>,
    content_id: web::Path<Uuid>,
) -> HttpResponse {
    let user_id = match auth::get_session_user_id(&session, &state.conn).await {
        Some(id) => id,
        None => {
            return HttpResponse::Unauthorized().json(serde_json::json!({
                "ok": false,
                "error": "Not signed in"
            }));
        }
    };

    let content_id = content_id.into_inner();

    let content = match ContentItems::find_by_id(content_id).one(&state.conn).await {
        Ok(Some(c)) => c,
        Ok(None) => {
            return HttpResponse::NotFound().json(serde_json::json!({
                "ok": false,
                "error": "Content not found"
            }));
        }
        Err(e) => {
            log::error!("DB error finding content: {e}");
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "ok": false,
                "error": "Database error"
            }));
        }
    };

    let existing = UserFavorites::find_by_id((user_id, content_id))
        .one(&state.conn)
        .await;

    match existing {
        Ok(Some(_)) => {
            // Already favourited — remove
            if let Err(e) = (user_favorites::ActiveModel {
                user_id: Set(user_id),
                content_id: Set(content_id),
                ..Default::default()
            })
            .delete(&state.conn)
            .await
            {
                log::error!("DB error deleting favourite: {e}");
                return HttpResponse::InternalServerError().json(serde_json::json!({
                    "ok": false,
                    "error": "Database error"
                }));
            }

            let new_count = (content.favorite_count - 1).max(0);
            let mut content_active: content_items::ActiveModel = content.into();
            content_active.favorite_count = Set(new_count);
            let _ = content_active.update(&state.conn).await;

            HttpResponse::Ok().json(serde_json::json!({
                "ok": true,
                "liked": false,
                "favourite_count": new_count
            }))
        }
        Ok(None) => {
            // Not favourited — add
            if let Err(e) = (user_favorites::ActiveModel {
                user_id: Set(user_id),
                content_id: Set(content_id),
                created_at: Set(chrono::Utc::now().naive_utc()),
            })
            .insert(&state.conn)
            .await
            {
                log::error!("DB error inserting favourite: {e}");
                return HttpResponse::InternalServerError().json(serde_json::json!({
                    "ok": false,
                    "error": "Database error"
                }));
            }

            let new_count = content.favorite_count + 1;
            let mut content_active: content_items::ActiveModel = content.into();
            content_active.favorite_count = Set(new_count);
            let _ = content_active.update(&state.conn).await;

            HttpResponse::Ok().json(serde_json::json!({
                "ok": true,
                "liked": true,
                "favourite_count": new_count
            }))
        }
        Err(e) => {
            log::error!("DB error checking favourite: {e}");
            HttpResponse::InternalServerError().json(serde_json::json!({
                "ok": false,
                "error": "Database error"
            }))
        }
    }
}
