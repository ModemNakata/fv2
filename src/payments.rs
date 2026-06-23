use actix_session::Session;
use actix_web::{HttpResponse, web};
use sea_orm::*;
use uuid::Uuid;

use crate::auth;
use crate::cryptowrap;
use crate::entity::prelude::*;
use crate::entity::sea_orm_active_enums::{ContentStatus, TransactionStatus};
use crate::entity::{transactions, user_purchases};
use crate::notifications;
use crate::AppState;

/// Initiate a crypto payment for a paywalled content item.
/// Body: { "currency": "XMR" | "LTC" }
/// Returns invoice info from cryptowrap including iframe_url.
pub async fn create_crypto_invoice(
    session: Session,
    state: web::Data<AppState>,
    content_id: web::Path<Uuid>,
    body: web::Json<serde_json::Value>,
) -> HttpResponse {
    let user_id = match auth::get_session_user_id(&session, &state.conn).await {
        Some(id) => id,
        None => {
            return HttpResponse::Unauthorized().json(serde_json::json!({
                "ok": false, "error": "Not signed in"
            }));
        }
    };

    let currency = match body.get("currency").and_then(|v| v.as_str()) {
        Some(c) if c == "XMR" || c == "LTC" => c.to_string(),
        _ => {
            return HttpResponse::BadRequest().json(serde_json::json!({
                "ok": false, "error": "Invalid or missing currency (supported: XMR, LTC)"
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
                    "ok": false, "error": "Content is not ready"
                }));
            }
            if !c.is_paywalled || c.price_cents <= 0 {
                return HttpResponse::BadRequest().json(serde_json::json!({
                    "ok": false, "error": "Content is not paywalled"
                }));
            }
            c
        }
        Ok(None) => {
            return HttpResponse::NotFound().json(serde_json::json!({
                "ok": false, "error": "Content not found"
            }));
        }
        Err(e) => {
            log::error!("DB error fetching content: {e}");
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "ok": false, "error": "Database error"
            }));
        }
    };

    // Don't charge yourself
    if content.uploader_id == user_id {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false, "error": "Cannot purchase your own content"
        }));
    }

    // Check if already purchased
    match UserPurchases::find_by_id((user_id, content_id))
        .one(&state.conn)
        .await
    {
        Ok(Some(_)) => {
            return HttpResponse::Ok().json(serde_json::json!({
                "ok": true, "already_purchased": true
            }));
        }
        Ok(None) => {}
        Err(e) => {
            log::error!("DB error checking purchase: {e}");
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "ok": false, "error": "Database error"
            }));
        }
    }

    // Convert cents to dollars for cryptowrap fiat_amount
    let fiat_amount = format!("{:.2}", content.price_cents as f64 / 100.0);

    // Create invoice in cryptowrap
    let invoice = match cryptowrap::create_invoice(&state.cryptowrap, &currency, &fiat_amount).await
    {
        Ok(inv) => inv,
        Err(e) => {
            log::error!("cryptowrap create_invoice failed: {e}");
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "ok": false, "error": "Payment processor error"
            }));
        }
    };

    // Create transaction record with Pending status
    let tx_id = Uuid::new_v4();
    let now = chrono::Utc::now().naive_utc();
    let tx = transactions::ActiveModel {
        id: Set(tx_id),
        buyer_id: Set(user_id),
        seller_id: Set(content.uploader_id),
        content_id: Set(Some(content_id)),
        amount_cents: Set(content.price_cents),
        status: Set(TransactionStatus::Pending),
        payment_provider_id: Set(Some(invoice.invoice_uuid.clone())),
        created_at: Set(now),
        updated_at: Set(now),
    };

    if let Err(e) = tx.insert(&state.conn).await {
        log::error!("DB error inserting pending transaction: {e}");
        return HttpResponse::InternalServerError().json(serde_json::json!({
            "ok": false, "error": "Database error"
        }));
    }

    HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "invoice_uuid": invoice.invoice_uuid,
        "iframe_url": invoice.iframe_url,
        "amount_requested": invoice.amount_requested,
        "currency": invoice.currency,
        "tx_id": tx_id,
    }))
}

/// Check the status of a crypto payment invoice.
/// Frontend polls this every few seconds after payment is submitted.
pub async fn check_payment_status(
    session: Session,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> HttpResponse {
    let user_id = match auth::get_session_user_id(&session, &state.conn).await {
        Some(id) => id,
        None => {
            return HttpResponse::Unauthorized().json(serde_json::json!({
                "ok": false, "error": "Not signed in"
            }));
        }
    };

    let invoice_uuid = path.into_inner().to_string();

    // Find the transaction by payment_provider_id
    let tx = match transactions::Entity::find()
        .filter(transactions::Column::PaymentProviderId.eq(&invoice_uuid))
        .one(&state.conn)
        .await
    {
        Ok(Some(tx)) => tx,
        Ok(None) => {
            return HttpResponse::NotFound().json(serde_json::json!({
                "ok": false, "error": "Transaction not found"
            }));
        }
        Err(e) => {
            log::error!("DB error finding transaction: {e}");
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "ok": false, "error": "Database error"
            }));
        }
    };

    // Verify this transaction belongs to the current user
    if tx.buyer_id != user_id {
        return HttpResponse::Forbidden().json(serde_json::json!({
            "ok": false, "error": "Not your transaction"
        }));
    }

    // If already completed, return early
    if tx.status == TransactionStatus::Completed {
        return HttpResponse::Ok().json(serde_json::json!({
            "ok": true,
            "status": "confirmed",
            "is_finalized": true,
        }));
    }

    // If failed, return early
    if tx.status == TransactionStatus::Failed {
        return HttpResponse::Ok().json(serde_json::json!({
            "ok": true,
            "status": "failed",
            "is_finalized": true,
        }));
    }

    // Check with cryptowrap
    match cryptowrap::check_invoice(&state.cryptowrap, &invoice_uuid).await {
        Ok(inv) => {
            // Map cryptowrap status to our flow
            let (our_status, finalized) = if cryptowrap::is_payment_successful(&inv.payment_status)
            {
                // Complete the purchase
                complete_purchase(&state, &tx, &invoice_uuid).await;
                ("confirmed", true)
            } else {
                match inv.payment_status.as_str() {
                    "detected" => ("detected", false),
                    "expired" => {
                        mark_transaction_failed(&state, tx.id).await;
                        ("expired", true)
                    }
                    "waiting" => ("waiting", false),
                    _ => ("unknown", inv.is_finalized),
                }
            };

            HttpResponse::Ok().json(serde_json::json!({
                "ok": true,
                "status": our_status,
                "is_finalized": finalized,
                "amount_requested": inv.amount_requested,
                "amount_received": inv.amount_received,
                "currency": inv.currency,
            }))
        }
        Err(e) => {
            log::error!("cryptowrap check_invoice failed: {e}");
            HttpResponse::Ok().json(serde_json::json!({
                "ok": true,
                "status": "error",
                "is_finalized": false,
                "error": "Failed to check payment status",
            }))
        }
    }
}

/// Webhook endpoint called by cryptowrap when invoice status changes.
/// We verify the status by calling cryptowrap ourselves (since webhook is unauthenticated).
pub async fn cryptowrap_webhook(
    state: web::Data<AppState>,
    body: web::Json<serde_json::Value>,
) -> HttpResponse {
    // Cryptowrap sends us the invoice_uuid somehow — accept from various possible formats
    let invoice_uuid = body
        .get("invoice_uuid")
        .or_else(|| body.get("uuid"))
        .or_else(|| body.get("id"))
        .and_then(|v| v.as_str());

    let invoice_uuid = match invoice_uuid {
        Some(u) => u,
        None => {
            log::warn!("cryptowrap webhook received without invoice_uuid: {body}");
            return HttpResponse::BadRequest().json(serde_json::json!({"ok": false}));
        }
    };

    log::info!("cryptowrap webhook received for invoice {invoice_uuid}");

    // Verify status by calling cryptowrap ourselves
    match cryptowrap::check_invoice(&state.cryptowrap, invoice_uuid).await {
        Ok(inv) => {
            if cryptowrap::is_payment_successful(&inv.payment_status) {
                // Find the pending transaction
                match transactions::Entity::find()
                    .filter(transactions::Column::PaymentProviderId.eq(invoice_uuid))
                    .one(&state.conn)
                    .await
                {
                    Ok(Some(tx)) => {
                        if tx.status != TransactionStatus::Completed {
                            complete_purchase(&state, &tx, invoice_uuid).await;
                            log::info!(
                                "webhook: purchase completed for tx {}",
                                tx.id
                            );
                        }
                    }
                    Ok(None) => {
                        log::warn!("webhook: no transaction found for invoice {invoice_uuid}");
                    }
                    Err(e) => {
                        log::error!("webhook: DB error: {e}");
                    }
                }
            }
            HttpResponse::Ok().json(serde_json::json!({"ok": true}))
        }
        Err(e) => {
            log::error!("webhook: verification failed for {invoice_uuid}: {e}");
            // Still return 200 so cryptowrap doesn't retry endlessly
            HttpResponse::Ok().json(serde_json::json!({"ok": true}))
        }
    }
}

// ── Helper functions ─────────────────────────────────────────────────────────

async fn complete_purchase(state: &AppState, tx: &transactions::Model, _invoice_uuid: &str) {
    let now = chrono::Utc::now().naive_utc();

    // Update transaction status to Completed
    let mut tx_active: transactions::ActiveModel = tx.clone().into();
    tx_active.status = Set(TransactionStatus::Completed);
    tx_active.updated_at = Set(now);
    if let Err(e) = tx_active.update(&state.conn).await {
        log::error!("failed to update transaction to completed: {e}");
    }

    // Create user_purchases record if content_id exists
    if let Some(content_id) = tx.content_id {
        // Check if purchase already exists (idempotency)
        let exists = UserPurchases::find_by_id((tx.buyer_id, content_id))
            .one(&state.conn)
            .await
            .ok()
            .flatten()
            .is_some();

        if !exists {
            if let Err(e) = (user_purchases::ActiveModel {
                user_id: Set(tx.buyer_id),
                content_id: Set(content_id),
                created_at: Set(now),
            })
            .insert(&state.conn)
            .await
            {
                log::error!("failed to insert user_purchase: {e}");
            }

            // Create purchase notification for seller
            // Fetch content title for the notification
            let content_title = ContentItems::find_by_id(content_id)
                .one(&state.conn)
                .await
                .ok()
                .flatten()
                .map(|c| c.title)
                .unwrap_or_default();

            let metadata = serde_json::json!({
                "content_id": content_id.to_string(),
                "content_title": content_title,
                "amount_cents": tx.amount_cents,
            });

            notifications::create_notification(
                &state.conn,
                tx.seller_id,
                Some(tx.buyer_id),
                "purchase",
                metadata,
            )
            .await;
        }
    }
}

async fn mark_transaction_failed(state: &AppState, tx_id: Uuid) {
    let now = chrono::Utc::now().naive_utc();
    if let Ok(Some(tx)) = transactions::Entity::find_by_id(tx_id).one(&state.conn).await {
        let mut tx_active: transactions::ActiveModel = tx.into();
        tx_active.status = Set(TransactionStatus::Failed);
        tx_active.updated_at = Set(now);
        if let Err(e) = tx_active.update(&state.conn).await {
            log::error!("failed to mark transaction as failed: {e}");
        }
    }
}
