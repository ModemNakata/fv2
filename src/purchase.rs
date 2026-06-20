use actix_session::Session;
use actix_web::{HttpResponse, web};
use sea_orm::*;
use uuid::Uuid;

use crate::auth;
use crate::entity::prelude::*;
use crate::entity::user_purchases;
use crate::AppState;

pub async fn purchase_content(
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

    let existing = UserPurchases::find_by_id((user_id, content_id))
        .one(&state.conn)
        .await;

    match existing {
        Ok(Some(_)) => {
            HttpResponse::Ok().json(serde_json::json!({
                "ok": true,
                "already_purchased": true
            }))
        }
        Ok(None) => {
            if let Err(e) = (user_purchases::ActiveModel {
                user_id: Set(user_id),
                content_id: Set(content_id),
                created_at: Set(chrono::Utc::now().naive_utc()),
            })
            .insert(&state.conn)
            .await
            {
                log::error!("DB error inserting purchase: {e}");
                return HttpResponse::InternalServerError().json(serde_json::json!({
                    "ok": false,
                    "error": "Database error"
                }));
            }

            HttpResponse::Ok().json(serde_json::json!({
                "ok": true,
                "already_purchased": false
            }))
        }
        Err(e) => {
            log::error!("DB error checking purchase: {e}");
            HttpResponse::InternalServerError().json(serde_json::json!({
                "ok": false,
                "error": "Database error"
            }))
        }
    }
}
