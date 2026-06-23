use actix_session::Session;
use actix_web::{HttpResponse, web};
use sea_orm::*;
use uuid::Uuid;

use crate::auth;
use crate::entity::prelude::*;
use crate::entity::sea_orm_active_enums::{ContentStatus, TransactionStatus};
use crate::entity::{transactions, user_purchases};
use crate::notifications;
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

    // Resolve content
    let content = match ContentItems::find_by_id(content_id)
        .one(&state.conn)
        .await
    {
        Ok(Some(c)) => {
            if c.status != ContentStatus::Ready {
                return HttpResponse::BadRequest().json(serde_json::json!({
                    "ok": false,
                    "error": "Content is not ready"
                }));
            }
            c
        }
        Ok(None) => {
            return HttpResponse::NotFound().json(serde_json::json!({
                "ok": false,
                "error": "Content not found"
            }));
        }
        Err(e) => {
            log::error!("DB error fetching content: {e}");
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "ok": false,
                "error": "Database error"
            }));
        }
    };

    // Don't charge yourself
    if content.uploader_id == user_id {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false,
            "error": "Cannot purchase your own content"
        }));
    }

    // Check if already purchased
    let existing = UserPurchases::find_by_id((user_id, content_id))
        .one(&state.conn)
        .await;

    match existing {
        Ok(Some(_)) => {
            return HttpResponse::Ok().json(serde_json::json!({
                "ok": true,
                "already_purchased": true
            }));
        }
        Ok(None) => {}
        Err(e) => {
            log::error!("DB error checking purchase: {e}");
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "ok": false,
                "error": "Database error"
            }));
        }
    }

    // Create user_purchases record
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

    // Create transaction record
    let tx_id = Uuid::new_v4();
    let now = chrono::Utc::now().naive_utc();
    let tx = transactions::ActiveModel {
        id: Set(tx_id),
        buyer_id: Set(user_id),
        seller_id: Set(content.uploader_id),
        content_id: Set(Some(content_id)),
        amount_cents: Set(content.price_cents),
        status: Set(TransactionStatus::Completed),
        payment_provider_id: Set(None), // internal credit — no external provider
        created_at: Set(now),
        updated_at: Set(now),
    };

    if let Err(e) = tx.insert(&state.conn).await {
        log::error!("DB error inserting transaction: {e}");
        // Purchase was already inserted — log but don't fail the response
    }

    // Create notification for seller
    let metadata = serde_json::json!({
        "content_id": content_id.to_string(),
        "content_title": content.title,
        "amount_cents": content.price_cents,
    });

    notifications::create_notification(
        &state.conn,
        content.uploader_id,
        Some(user_id),
        "purchase",
        metadata,
    )
    .await;

    HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "already_purchased": false
    }))
}
