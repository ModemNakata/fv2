//! View counter system — Redis-buffered, deduplicated content view tracking.
//!
//! Architecture:
//!   POST /api/content/{uuid}/view  →  track_view()
//!     - SHA256(IP + User-Agent) dedup lock in Redis (15 min TTL)
//!     - INCR content:{uuid}:views in Redis (write-behind buffer)
//!   Background worker (tokio::spawn) flushes counters to Postgres every 5 min

use std::time::Duration;

use actix_web::{HttpRequest, HttpResponse, web};
use sea_orm::{ActiveModelTrait, EntityTrait, Set};
use sha2::Digest;
use uuid::Uuid;

use crate::AppState;
use crate::entity::content_items;
use crate::entity::prelude::ContentItems;

// ── Redis connection URL from env ───────────────────────────────────────────

pub fn redis_url() -> String {
    let host = std::env::var("REDIS_HOST").unwrap_or_else(|_| "127.0.0.1".to_string()); // "redis"
    let port = std::env::var("REDIS_PORT").unwrap_or_else(|_| "6379".to_string());
    let pass = std::env::var("REDIS_PASS").unwrap_or_default();
    if pass.is_empty() {
        format!("redis://{host}:{port}/")
    } else {
        format!("redis://:{pass}@{host}:{port}/")
    }
}

// ── View tracking endpoint ──────────────────────────────────────────────────

pub async fn track_view(
    req: HttpRequest,
    state: web::Data<AppState>,
    content_id: web::Path<Uuid>,
) -> HttpResponse {
    let content_id = content_id.into_inner();

    // 1. Build visitor fingerprint from IP + User-Agent
    let ip = req
        .headers()
        .get("X-Real-IP")
        .and_then(|v| v.to_str().ok())
        .or_else(|| {
            req.headers()
                .get("X-Forwarded-For")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.split(',').next().map(|s| s.trim()))
        })
        .map(|s| s.to_string())
        .or_else(|| req.peer_addr().map(|a| a.ip().to_string()))
        .unwrap_or_else(|| "unknown".to_string());

    let user_agent = req
        .headers()
        .get("User-Agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let hash = hex::encode({
        let mut h = sha2::Sha256::new();
        h.update(ip.as_bytes());
        h.update(user_agent.as_bytes());
        h.finalize()
    });

    // 2. Redis dedup lock + counter increment
    let lock_key = format!("view_lock:content:{}:{}", content_id, hash);
    let counter_key = format!("content:{}:views", content_id);

    let mut conn = state.redis_conn.clone();

    let locked: Result<Option<String>, redis::RedisError> = redis::cmd("SET")
        .arg(&lock_key)
        .arg("1")
        .arg("NX")
        .arg("EX")
        .arg(900u64) // 900s = 15m (TTL) ///  After 15 minutes the lock expires automatically, so the same visitor can be counted again
        .query_async(&mut conn)
        .await;

    match locked {
        Ok(Some(_)) => {
            // New unique visitor — increment counter
            let _: Result<i64, _> = redis::cmd("INCR")
                .arg(&counter_key)
                .query_async(&mut conn)
                .await;
        }
        Ok(None) => {
            // Duplicate within 15 min — skip
        }
        Err(e) => {
            log::error!("[view_counter] Redis error: {e}");
        }
    }

    HttpResponse::Ok().json(serde_json::json!({}))
}

// ── Background sync worker ───────────────────────────────────────────────────

pub async fn sync_views_to_db(state: AppState) {
    let mut interval = actix_web::rt::time::interval(Duration::from_secs(300));
    loop {
        interval.tick().await;
        if let Err(e) = sync_once(&state).await {
            log::error!("[view_counter] sync worker error: {e}");
        }
    }
}

async fn sync_once(state: &AppState) -> Result<(), Box<dyn std::error::Error>> {
    let mut conn = state.redis_conn.clone();
    let mut cursor: u64 = 0;
    let pattern = "content:*:views";

    loop {
        let (next_cursor, keys): (u64, Vec<String>) = redis::cmd("SCAN")
            .arg(cursor)
            .arg("MATCH")
            .arg(pattern)
            .arg("COUNT")
            .arg(100u64)
            .query_async(&mut conn)
            .await?;

        for key in &keys {
            // Parse content_id from "content:{uuid}:views"
            let parts: Vec<&str> = key.split(':').collect();
            if parts.len() < 3 {
                continue;
            }
            let content_id: Uuid = match parts[1].parse() {
                Ok(id) => id,
                Err(_) => continue,
            };

            // GET current value
            let count: i64 = match redis::cmd("GET")
                .arg(key.as_str())
                .query_async(&mut conn)
                .await
            {
                Ok(Some(v)) => v,
                _ => continue,
            };

            if count <= 0 {
                continue;
            }

            // DECRBY — atomic subtraction preserves concurrent increments
            let remaining: i64 = redis::cmd("DECRBY")
                .arg(key.as_str())
                .arg(count)
                .query_async(&mut conn)
                .await?;

            // Update PostgreSQL
            let content = ContentItems::find_by_id(content_id)
                .one(&state.conn)
                .await?;

            if let Some(content) = content {
                let mut active: content_items::ActiveModel = content.into();
                active.view_count = Set(active.view_count.unwrap() + count);
                active.update(&state.conn).await?;
                log::info!(
                    "[view_counter] synced +{} views to content {}",
                    count,
                    content_id
                );
            }

            // Clean up zero-value keys
            if remaining == 0 {
                let _: Result<(), _> = redis::cmd("DEL")
                    .arg(key.as_str())
                    .query_async(&mut conn)
                    .await;
            }
        }

        if next_cursor == 0 {
            break;
        }
        cursor = next_cursor;
    }

    Ok(())
}
