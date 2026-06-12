use actix_web::{HttpRequest, HttpResponse, web};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, Set};
use serde::Serialize;
use uuid::Uuid;

use crate::entity::sea_orm_active_enums::{ContentStatus, ContentType};
use crate::entity::{content_items, image_sets, images, video_formats, videos};
use crate::AppState;

#[derive(Serialize)]
struct PendingItem {
    content_id: Uuid,
    content_type: String,
    title: String,
    files: Vec<PendingFile>,
}

#[derive(Serialize)]
struct PendingFile {
    path: String,
}

fn item_to_pending(
    item: &content_items::Model,
    video_formats: &[video_formats::Model],
    all_images: &[images::Model],
) -> PendingItem {
    let content_type = match item.r#type {
        ContentType::Video => "video",
        ContentType::ImageSet => "image_set",
    }
    .to_string();

    let files = match item.r#type {
        ContentType::Video => video_formats
            .iter()
            .filter(|f| f.video_id == item.id)
            .map(|f| PendingFile {
                path: f.orig_storage_path.clone(),
            })
            .collect(),
        ContentType::ImageSet => all_images
            .iter()
            .filter(|img| img.image_set_id == item.id)
            .map(|img| PendingFile {
                path: img.orig_storage_path.clone(),
            })
            .collect(),
    };

    PendingItem {
        content_id: item.id,
        content_type,
        title: item.title.clone(),
        files,
    }
}

pub async fn pending_processing(state: web::Data<AppState>) -> HttpResponse {
    let items = match content_items::Entity::find()
        .filter(content_items::Column::Status.eq(ContentStatus::Processing))
        .all(&state.conn)
        .await
    {
        Ok(items) => items,
        Err(e) => {
            log::error!("DB error fetching pending items: {e}");
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Database error"
            }));
        }
    };

    if items.is_empty() {
        return HttpResponse::Ok().json(Vec::<PendingItem>::new());
    }

    let mut video_ids = Vec::new();
    let mut image_set_ids = Vec::new();
    for item in &items {
        match item.r#type {
            ContentType::Video => video_ids.push(item.id),
            ContentType::ImageSet => image_set_ids.push(item.id),
        }
    }

    let video_formats = if !video_ids.is_empty() {
        video_formats::Entity::find()
            .filter(video_formats::Column::VideoId.is_in(video_ids))
            .filter(video_formats::Column::Resolution.eq("original"))
            .all(&state.conn)
            .await
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    let all_images = if !image_set_ids.is_empty() {
        images::Entity::find()
            .filter(images::Column::ImageSetId.is_in(image_set_ids))
            .order_by(images::Column::SortOrder, sea_orm::Order::Asc)
            .all(&state.conn)
            .await
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    let result: Vec<PendingItem> = items
        .iter()
        .map(|item| item_to_pending(item, &video_formats, &all_images))
        .collect();

    HttpResponse::Ok().json(result)
}

pub async fn get_content(
    state: web::Data<AppState>,
    content_id: web::Path<Uuid>,
) -> HttpResponse {
    let content_id = content_id.into_inner();

    let item = match content_items::Entity::find_by_id(content_id).one(&state.conn).await {
        Ok(Some(item)) => item,
        Ok(None) => {
            return HttpResponse::NotFound().json(serde_json::json!({
                "error": "Content not found"
            }));
        }
        Err(e) => {
            log::error!("DB error fetching content {content_id}: {e}");
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Database error"
            }));
        }
    };

    let video_formats = match item.r#type {
        ContentType::Video => video_formats::Entity::find()
            .filter(video_formats::Column::VideoId.eq(content_id))
            .filter(video_formats::Column::Resolution.eq("original"))
            .all(&state.conn)
            .await
            .unwrap_or_default(),
        ContentType::ImageSet => Vec::new(),
    };

    let all_images = match item.r#type {
        ContentType::ImageSet => images::Entity::find()
            .filter(images::Column::ImageSetId.eq(content_id))
            .order_by(images::Column::SortOrder, sea_orm::Order::Asc)
            .all(&state.conn)
            .await
            .unwrap_or_default(),
        ContentType::Video => Vec::new(),
    };

    let result = item_to_pending(&item, &video_formats, &all_images);
    HttpResponse::Ok().json(result)
}

#[derive(serde::Deserialize)]
pub(crate) struct StatusUpdate {
    status: String,
    #[serde(default)]
    thumbnail_url: Option<String>,
    #[serde(default)]
    preview_path: Option<String>,
    #[serde(default)]
    duration: Option<f64>,
    #[serde(default)]
    processed_files: Option<Vec<String>>,
}

pub async fn update_status(
    req: HttpRequest,
    state: web::Data<AppState>,
    content_id: web::Path<Uuid>,
    body: web::Json<StatusUpdate>,
) -> HttpResponse {
    let api_key = req
        .headers()
        .get("X-Api-Key")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let expected = std::env::var("S3_ACCESS_KEY").ok();

    match (api_key, expected) {
        (Some(key), Some(expected)) if key == expected => {}
        _ => {
            return HttpResponse::Unauthorized().json(serde_json::json!({
                "error": "Invalid or missing API key"
            }));
        }
    }

    let content_id = content_id.into_inner();

    let new_status = match body.status.as_str() {
        "ready" => ContentStatus::Ready,
        "failed" => ContentStatus::Failed,
        _ => {
            return HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Invalid status. Must be 'ready' or 'failed'"
            }));
        }
    };

    match content_items::Entity::find_by_id(content_id).one(&state.conn).await {
        Ok(Some(content)) => {
            let content_type = content.r#type.clone();
            let now = chrono::Utc::now().naive_utc();
            let mut content: content_items::ActiveModel = content.into();
            content.status = Set(new_status);
            content.updated_at = Set(now);

            if let Some(ref url) = body.thumbnail_url {
                content.thumbnail_url = Set(Some(url.clone()));
            }

            if let Err(e) = content.update(&state.conn).await {
                log::error!("DB error updating status: {e}");
                return HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": "Failed to update status"
                }));
            }

            if let Some(ref preview) = body.preview_path {
                match content_type {
                    ContentType::Video => {
                        if let Ok(Some(video)) = videos::Entity::find_by_id(content_id).one(&state.conn).await {
                            let mut video: videos::ActiveModel = video.into();
                            video.preview_path = Set(Some(preview.clone()));
                            if let Err(e) = video.update(&state.conn).await {
                                log::error!("DB error updating video preview_path: {e}");
                            }
                        } else {
                            log::warn!("video record not found for content_id {content_id}, skipping preview_path");
                        }
                    }
                    ContentType::ImageSet => {
                        if let Ok(Some(image_set)) = image_sets::Entity::find_by_id(content_id).one(&state.conn).await {
                            let mut image_set: image_sets::ActiveModel = image_set.into();
                            image_set.preview_path = Set(Some(preview.clone()));
                            if let Err(e) = image_set.update(&state.conn).await {
                                log::error!("DB error updating image_set preview_path: {e}");
                            }
                        } else {
                            log::warn!("image_set record not found for content_id {content_id}, skipping preview_path");
                        }
                    }
                }
            }

            if let Some(dur) = body.duration {
                let duration_secs = dur.round() as i32;
                if let Ok(Some(video)) = videos::Entity::find_by_id(content_id).one(&state.conn).await {
                    let mut video: videos::ActiveModel = video.into();
                    video.duration_seconds = Set(Some(duration_secs));
                    if let Err(e) = video.update(&state.conn).await {
                        log::error!("DB error updating duration_seconds: {e}");
                    }
                } else {
                    log::warn!("video record not found for content_id {content_id}, skipping duration");
                }
            }

            if let Some(ref files) = body.processed_files {
                match content_type {
                    ContentType::Video => {
                        if let Some(path) = files.first() {
                            if let Ok(Some(fmt)) = video_formats::Entity::find()
                                .filter(video_formats::Column::VideoId.eq(content_id))
                                .filter(video_formats::Column::Resolution.eq("original"))
                                .one(&state.conn)
                                .await
                            {
                                let mut fmt: video_formats::ActiveModel = fmt.into();
                                fmt.storage_path = Set(Some(path.clone()));
                                if let Err(e) = fmt.update(&state.conn).await {
                                    log::error!("DB error updating video_format storage_path: {e}");
                                }
                            }
                        }
                    }
                    ContentType::ImageSet => {
                        if let Ok(imgs) = images::Entity::find()
                            .filter(images::Column::ImageSetId.eq(content_id))
                            .order_by(images::Column::SortOrder, sea_orm::Order::Asc)
                            .all(&state.conn)
                            .await
                        {
                            for (i, img) in imgs.iter().enumerate() {
                                if let Some(path) = files.get(i) {
                                    let mut img: images::ActiveModel = img.clone().into();
                                    img.storage_path = Set(Some(path.clone()));
                                    if let Err(e) = img.update(&state.conn).await {
                                        log::error!("DB error updating image storage_path: {e}");
                                    }
                                }
                            }
                        }
                    }
                }
            }

            HttpResponse::Ok().json(serde_json::json!({"ok": true}))
        }
        Ok(None) => HttpResponse::NotFound().json(serde_json::json!({
            "error": "Content not found"
        })),
        Err(e) => {
            log::error!("DB error finding content: {e}");
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Database error"
            }))
        }
    }
}
