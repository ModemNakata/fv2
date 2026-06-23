use actix_session::Session;
use actix_web::{HttpResponse, web};
use askama::Template;
use sea_orm::*;
use sea_orm::sea_query::Expr;
use serde::Serialize;
use uuid::Uuid;

use crate::auth;
use crate::entity::prelude::*;
use crate::entity::notifications;
use crate::AppState;

const NOTIFICATIONS_PER_PAGE: u64 = 20;
const DROPDOWN_LIMIT: u64 = 5;

fn time_ago(dt: &chrono::NaiveDateTime) -> String {
    let now = chrono::Utc::now().naive_utc();
    let diff = now - *dt;
    let seconds = diff.num_seconds();
    if seconds < 60 {
        format!("{}s ago", seconds)
    } else if seconds < 3600 {
        format!("{}m ago", seconds / 60)
    } else if seconds < 86400 {
        format!("{}h ago", seconds / 3600)
    } else if seconds < 2592000 {
        format!("{}d ago", seconds / 86400)
    } else {
        format!("{}mo ago", seconds / 2592000)
    }
}

#[derive(Template)]
#[template(path = "notifications.html")]
struct NotificationsPage {
    username: String,
    logged_in: bool,
    session_avatar_url: Option<String>,
    version: String,
    #[allow(dead_code)]
    unread_count: u64,
}

#[derive(Serialize)]
struct NotificationJson {
    id: Uuid,
    r#type: String,
    metadata: serde_json::Value,
    is_read: bool,
    created_at: String,
    time_ago: String,
}

#[derive(Serialize)]
struct NotificationListResponse {
    ok: bool,
    notifications: Vec<NotificationJson>,
    has_more: bool,
}

#[derive(Serialize)]
struct UnreadCountResponse {
    ok: bool,
    count: u64,
}

pub async fn notifications_page(
    session: Session,
    state: web::Data<AppState>,
) -> HttpResponse {
    let user = match auth::require_user(&session, &state.conn).await {
        Ok(u) => u,
        Err(resp) => return resp,
    };
    let session_user = auth::get_session_user(&session, &state.conn).await;
    let logged_in = session_user.is_some();
    let unread_count = count_unread(&state.conn, user.id).await;

    let html = NotificationsPage {
        username: user.username,
        logged_in,
        session_avatar_url: user.avatar_url,
        version: state.static_version.clone(),
        unread_count,
    }
    .render()
    .expect("notifications.html should be valid");

    HttpResponse::Ok().body(html)
}

pub async fn api_notifications(
    session: Session,
    state: web::Data<AppState>,
    query: web::Query<std::collections::HashMap<String, String>>,
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

    let offset: u64 = query.get("offset").and_then(|v| v.parse().ok()).unwrap_or(0);

    let list = Notifications::find()
        .filter(notifications::Column::UserId.eq(user_id))
        .order_by_desc(notifications::Column::CreatedAt)
        .offset(offset)
        .limit(NOTIFICATIONS_PER_PAGE + 1)
        .all(&state.conn)
        .await;

    let notifications = match list {
        Ok(n) => n,
        Err(e) => {
            log::error!("DB error fetching notifications: {e}");
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "ok": false,
                "error": "Database error"
            }));
        }
    };

    let has_more = notifications.len() > NOTIFICATIONS_PER_PAGE as usize;
    let items: Vec<NotificationJson> = notifications
        .into_iter()
        .take(NOTIFICATIONS_PER_PAGE as usize)
        .map(|n| NotificationJson {
            id: n.id,
            r#type: n.r#type,
            metadata: n.metadata,
            is_read: n.is_read,
            created_at: n.created_at.format("%Y-%m-%d %H:%M").to_string(),
            time_ago: time_ago(&n.created_at),
        })
        .collect();

    HttpResponse::Ok().json(NotificationListResponse {
        ok: true,
        notifications: items,
        has_more,
    })
}

pub async fn api_unread_count(
    session: Session,
    state: web::Data<AppState>,
) -> HttpResponse {
    let user_id = match auth::get_session_user_id(&session, &state.conn).await {
        Some(id) => id,
        None => {
            return HttpResponse::Ok().json(UnreadCountResponse {
                ok: true,
                count: 0,
            });
        }
    };

    let count = count_unread(&state.conn, user_id).await;

    HttpResponse::Ok().json(UnreadCountResponse { ok: true, count })
}

pub async fn api_recent(
    session: Session,
    state: web::Data<AppState>,
) -> HttpResponse {
    let user_id = match auth::get_session_user_id(&session, &state.conn).await {
        Some(id) => id,
        None => {
            return HttpResponse::Ok().json(NotificationListResponse {
                ok: true,
                notifications: vec![],
                has_more: false,
            });
        }
    };

    let list = Notifications::find()
        .filter(notifications::Column::UserId.eq(user_id))
        .order_by_desc(notifications::Column::CreatedAt)
        .limit(DROPDOWN_LIMIT)
        .all(&state.conn)
        .await;

    let items = match list {
        Ok(n) => n
            .into_iter()
            .map(|n| NotificationJson {
                id: n.id,
                r#type: n.r#type,
                metadata: n.metadata,
                is_read: n.is_read,
                created_at: n.created_at.format("%Y-%m-%d %H:%M").to_string(),
                time_ago: time_ago(&n.created_at),
            })
            .collect(),
        Err(e) => {
            log::error!("DB error fetching recent notifications: {e}");
            return HttpResponse::Ok().json(NotificationListResponse {
                ok: true,
                notifications: vec![],
                has_more: false,
            });
        }
    };

    HttpResponse::Ok().json(NotificationListResponse {
        ok: true,
        notifications: items,
        has_more: false,
    })
}

pub async fn api_mark_read(
    session: Session,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
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

    let notif_id = path.into_inner();

    let result = Notifications::find_by_id(notif_id)
        .one(&state.conn)
        .await;

    let notif = match result {
        Ok(Some(n)) => n,
        Ok(None) => {
            return HttpResponse::NotFound().json(serde_json::json!({
                "ok": false,
                "error": "Notification not found"
            }));
        }
        Err(e) => {
            log::error!("DB error fetching notification: {e}");
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "ok": false,
                "error": "Database error"
            }));
        }
    };

    if notif.user_id != user_id {
        return HttpResponse::Forbidden().json(serde_json::json!({
            "ok": false,
            "error": "Not your notification"
        }));
    }

    let mut active: notifications::ActiveModel = notif.into();
    active.is_read = Set(true);

    if let Err(e) = active.update(&state.conn).await {
        log::error!("DB error marking notification read: {e}");
        return HttpResponse::InternalServerError().json(serde_json::json!({
            "ok": false,
            "error": "Database error"
        }));
    }

    HttpResponse::Ok().json(serde_json::json!({ "ok": true }))
}

pub async fn api_mark_all_read(
    session: Session,
    state: web::Data<AppState>,
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

    if let Err(e) = Notifications::update_many()
        .filter(notifications::Column::UserId.eq(user_id))
        .filter(notifications::Column::IsRead.eq(false))
        .col_expr(notifications::Column::IsRead, Expr::value(true))
        .exec(&state.conn)
        .await
    {
        log::error!("DB error marking all notifications read: {e}");
        return HttpResponse::InternalServerError().json(serde_json::json!({
            "ok": false,
            "error": "Database error"
        }));
    }

    HttpResponse::Ok().json(serde_json::json!({ "ok": true }))
}

async fn count_unread(db: &DatabaseConnection, user_id: Uuid) -> u64 {
    Notifications::find()
        .filter(notifications::Column::UserId.eq(user_id))
        .filter(notifications::Column::IsRead.eq(false))
        .count(db)
        .await
        .unwrap_or(0)
}

/// Create a notification for a user. Returns the notification ID.
pub async fn create_notification(
    db: &DatabaseConnection,
    user_id: Uuid,
    actor_id: Option<Uuid>,
    r#type: &str,
    metadata: serde_json::Value,
) -> Uuid {
    let id = Uuid::new_v4();
    let now = chrono::Utc::now().naive_utc();

    let model = notifications::ActiveModel {
        id: Set(id),
        user_id: Set(user_id),
        actor_id: Set(actor_id),
        r#type: Set(r#type.to_string()),
        metadata: Set(metadata),
        is_read: Set(false),
        created_at: Set(now),
    };

    if let Err(e) = model.insert(db).await {
        log::error!("Failed to create notification: {e}");
    }

    id
}
