use actix_session::Session;
use actix_web::{HttpRequest, HttpResponse, web};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, ModelTrait, QueryFilter, QueryOrder, Set,
};
use serde::Serialize;
use std::collections::HashMap;
use uuid::Uuid;

use crate::auth;

use crate::AppState;
use crate::entity::prelude::*;
use crate::entity::sea_orm_active_enums::{ContentStatus, ContentType};
use crate::entity::{content_items, image_sets, images, users, video_formats, videos};

#[derive(Serialize)]
struct PendingItem {
    content_id: Uuid,
    content_type: String,
    title: String,
    uploader_name: String,
    is_paywalled: bool,
    price_cents: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    free_preview_duration_s: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    unblurred_count: Option<i32>,
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
    videos_map: &std::collections::HashMap<Uuid, videos::Model>,
    image_sets_map: &std::collections::HashMap<Uuid, image_sets::Model>,
    uploader_name: &str,
) -> PendingItem {
    let content_type = match item.r#type {
        ContentType::Video => "video",
        ContentType::ImageSet => "image_set",
    }
    .to_string();

    let (free_preview_duration_s, unblurred_count) = match item.r#type {
        ContentType::Video => (
            videos_map
                .get(&item.id)
                .and_then(|v| v.free_preview_duration_s),
            None,
        ),
        ContentType::ImageSet => (
            None,
            image_sets_map.get(&item.id).and_then(|s| s.unblurred_count),
        ),
    };

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
        uploader_name: uploader_name.to_string(),
        is_paywalled: item.is_paywalled,
        price_cents: item.price_cents,
        free_preview_duration_s,
        unblurred_count,
        files,
    }
}

pub async fn pending_processing(
    state: web::Data<AppState>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> HttpResponse {
    let show_all = query.get("all").map_or(false, |v| v == "true");

    let mut filter = ContentItems::find();
    if !show_all {
        filter = filter.filter(content_items::Column::Status.eq(ContentStatus::Processing));
    }

    let items = match filter.all(&state.conn).await {
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
        VideoFormats::find()
            .filter(video_formats::Column::VideoId.is_in(video_ids.clone()))
            // Pipeline needs the original upload file (resolution = "original").
            // Processed resolution rows are created later by update_status.
            .filter(video_formats::Column::Resolution.eq("original"))
            .all(&state.conn)
            .await
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    let all_images = if !image_set_ids.is_empty() {
        Images::find()
            .filter(images::Column::ImageSetId.is_in(image_set_ids.clone()))
            .order_by(images::Column::SortOrder, sea_orm::Order::Asc)
            .all(&state.conn)
            .await
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    let videos_map: std::collections::HashMap<Uuid, videos::Model> = if !video_ids.is_empty() {
        Videos::find()
            .filter(videos::Column::ContentId.is_in(video_ids.clone()))
            .all(&state.conn)
            .await
            .unwrap_or_default()
            .into_iter()
            .map(|v| (v.content_id, v))
            .collect()
    } else {
        std::collections::HashMap::new()
    };

    let image_sets_map: std::collections::HashMap<Uuid, image_sets::Model> =
        if !image_set_ids.is_empty() {
            ImageSets::find()
                .filter(image_sets::Column::ContentId.is_in(image_set_ids.clone()))
                .all(&state.conn)
                .await
                .unwrap_or_default()
                .into_iter()
                .map(|s| (s.content_id, s))
                .collect()
        } else {
            std::collections::HashMap::new()
        };

    let uploader_ids: Vec<Uuid> = items.iter().map(|i| i.uploader_id).collect();
    let users_map: std::collections::HashMap<Uuid, String> = if !uploader_ids.is_empty() {
        Users::find()
            .filter(users::Column::Id.is_in(uploader_ids))
            .all(&state.conn)
            .await
            .unwrap_or_default()
            .into_iter()
            .map(|u| (u.id, u.username))
            .collect()
    } else {
        std::collections::HashMap::new()
    };

    let result: Vec<PendingItem> = items
        .iter()
        .map(|item| {
            let username = users_map
                .get(&item.uploader_id)
                .cloned()
                .unwrap_or_default();
            item_to_pending(
                item,
                &video_formats,
                &all_images,
                &videos_map,
                &image_sets_map,
                &username,
            )
        })
        .collect();

    HttpResponse::Ok().json(result)
}

pub async fn get_content(state: web::Data<AppState>, content_id: web::Path<Uuid>) -> HttpResponse {
    let content_id = content_id.into_inner();

    let item = match ContentItems::find_by_id(content_id).one(&state.conn).await {
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
        ContentType::Video => VideoFormats::find()
            .filter(video_formats::Column::VideoId.eq(content_id))
            // Pipeline needs the original upload file (resolution = "original").
            // Processed resolution rows are created later by update_status.
            .filter(video_formats::Column::Resolution.eq("original"))
            .all(&state.conn)
            .await
            .unwrap_or_default(),
        ContentType::ImageSet => Vec::new(),
    };

    let all_images = match item.r#type {
        ContentType::ImageSet => Images::find()
            .filter(images::Column::ImageSetId.eq(content_id))
            .order_by(images::Column::SortOrder, sea_orm::Order::Asc)
            .all(&state.conn)
            .await
            .unwrap_or_default(),
        ContentType::Video => Vec::new(),
    };

    let username = match Users::find_by_id(item.uploader_id).one(&state.conn).await {
        Ok(Some(u)) => u.username,
        _ => String::new(),
    };

    let v_map = match item.r#type {
        ContentType::Video => {
            let mut m = std::collections::HashMap::new();
            if let Ok(Some(v)) = Videos::find_by_id(content_id).one(&state.conn).await {
                m.insert(v.content_id, v);
            }
            m
        }
        ContentType::ImageSet => std::collections::HashMap::new(),
    };

    let is_map = match item.r#type {
        ContentType::ImageSet => {
            let mut m = std::collections::HashMap::new();
            if let Ok(Some(s)) = ImageSets::find_by_id(content_id).one(&state.conn).await {
                m.insert(s.content_id, s);
            }
            m
        }
        ContentType::Video => std::collections::HashMap::new(),
    };

    let result = item_to_pending(
        &item,
        &video_formats,
        &all_images,
        &v_map,
        &is_map,
        &username,
    );
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
    free_preview_path: Option<String>,
    #[serde(default)]
    duration: Option<f64>,
    // HLS mode (can be revived): processed_files was Vec<String>,
    // first entry stored as HLS master playlist path in video_formats.storage_path
    // Now used for image_sets only (index-based path mapping).
    #[serde(default)]
    processed_files: Option<Vec<String>>,
    // Multi-resolution mode: map of resolution → S3 path.
    // Pipeline generates one entry per resolution (e.g. "1920x1080", "1280x720", "854x480").
    // Each entry creates/updates a video_formats row for this video.
    #[serde(default)]
    video_formats: Option<HashMap<String, String>>,
    #[serde(default)]
    blurred_files: Option<Vec<String>>,
    #[serde(default)]
    source_quality: Option<String>,
    // Original source resolution in "WxH" format (e.g. "1920x1080").
    // Determined via ffprobe before encoding. Stored in videos.source_resolution.
    #[serde(default)]
    source_resolution: Option<String>,
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

    let expected = std::env::var("PIPELINE_RAND_HEX").ok();

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

    match ContentItems::find_by_id(content_id).one(&state.conn).await {
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
                        if let Ok(Some(video)) =
                            Videos::find_by_id(content_id).one(&state.conn).await
                        {
                            let mut video: videos::ActiveModel = video.into();
                            video.preview_path = Set(Some(preview.clone()));
                            if let Err(e) = video.update(&state.conn).await {
                                log::error!("DB error updating video preview_path: {e}");
                            }
                        } else {
                            log::warn!(
                                "video record not found for content_id {content_id}, skipping preview_path"
                            );
                        }
                    }
                    ContentType::ImageSet => {
                        if let Ok(Some(image_set)) =
                            ImageSets::find_by_id(content_id).one(&state.conn).await
                        {
                            let mut image_set: image_sets::ActiveModel = image_set.into();
                            image_set.preview_path = Set(Some(preview.clone()));
                            if let Err(e) = image_set.update(&state.conn).await {
                                log::error!("DB error updating image_set preview_path: {e}");
                            }
                        } else {
                            log::warn!(
                                "image_set record not found for content_id {content_id}, skipping preview_path"
                            );
                        }
                    }
                }
            }

            if let Some(dur) = body.duration {
                let duration_secs = dur.round() as i32;
                if let Ok(Some(video)) = Videos::find_by_id(content_id).one(&state.conn).await {
                    let mut video: videos::ActiveModel = video.into();
                    video.duration_seconds = Set(Some(duration_secs));
                    if let Err(e) = video.update(&state.conn).await {
                        log::error!("DB error updating duration_seconds: {e}");
                    }
                } else {
                    log::warn!(
                        "video record not found for content_id {content_id}, skipping duration"
                    );
                }
            }

            if let Some(ref preview) = body.free_preview_path {
                if let Ok(Some(video)) = Videos::find_by_id(content_id).one(&state.conn).await {
                    let mut video: videos::ActiveModel = video.into();
                    video.preview_path = Set(Some(preview.clone()));
                    if let Err(e) = video.update(&state.conn).await {
                        log::error!("DB error updating free preview_path: {e}");
                    }
                } else {
                    log::warn!(
                        "video record not found for content_id {content_id}, skipping free_preview_path"
                    );
                }
            }

            if let Some(ref sq) = body.source_quality {
                if let Ok(Some(video)) = Videos::find_by_id(content_id).one(&state.conn).await {
                    let mut video: videos::ActiveModel = video.into();
                    video.source_quality = Set(Some(sq.clone()));
                    if let Err(e) = video.update(&state.conn).await {
                        log::error!("DB error updating source_quality: {e}");
                    }
                } else {
                    log::warn!(
                        "video record not found for content_id {content_id}, skipping source_quality"
                    );
                }
            }

            if let Some(ref sr) = body.source_resolution {
                if let Ok(Some(video)) = Videos::find_by_id(content_id).one(&state.conn).await {
                    let mut video: videos::ActiveModel = video.into();
                    video.source_resolution = Set(Some(sr.clone()));
                    if let Err(e) = video.update(&state.conn).await {
                        log::error!("DB error updating source_resolution: {e}");
                    }
                } else {
                    log::warn!(
                        "video record not found for content_id {content_id}, skipping source_resolution"
                    );
                }
            }

            if let Some(ref blurred) = body.blurred_files {
                if let Ok(imgs) = Images::find()
                    .filter(images::Column::ImageSetId.eq(content_id))
                    .order_by(images::Column::SortOrder, sea_orm::Order::Asc)
                    .all(&state.conn)
                    .await
                {
                    for (i, img) in imgs.iter().enumerate() {
                        if let Some(path) = blurred.get(i) {
                            let mut img: images::ActiveModel = img.clone().into();
                            img.blurred_storage_path = Set(Some(path.clone()));
                            if let Err(e) = img.update(&state.conn).await {
                                log::error!("DB error updating blurred_storage_path: {e}");
                            }
                        }
                    }
                }
            }

            // HLS mode (can be revived): processed_files was Vec<String>,
            // first entry stored as HLS master playlist path in video_formats.storage_path.
            // Now used for image_sets only.
            // if let Some(ref files) = body.processed_files {
            //     match content_type {
            //         ContentType::Video => {
            //             if let Some(path) = files.first() {
            //                 if let Ok(Some(fmt)) = VideoFormats::find()
            //                     .filter(video_formats::Column::VideoId.eq(content_id))
            //                     .filter(video_formats::Column::Resolution.eq("original"))
            //                     .one(&state.conn)
            //                     .await
            //                 {
            //                     let mut fmt: video_formats::ActiveModel = fmt.into();
            //                     fmt.storage_path = Set(Some(path.clone()));
            //                     if let Err(e) = fmt.update(&state.conn).await {
            //                         log::error!("DB error updating video_format storage_path: {e}");
            //                     }
            //                 }
            //             }
            //         }
            //         ContentType::ImageSet => {
            //             if let Ok(imgs) = Images::find()
            //                 .filter(images::Column::ImageSetId.eq(content_id))
            //                 .order_by(images::Column::SortOrder, sea_orm::Order::Asc)
            //                 .all(&state.conn)
            //                 .await
            //             {
            //                 for (i, img) in imgs.iter().enumerate() {
            //                     if let Some(path) = files.get(i) {
            //                         let mut img: images::ActiveModel = img.clone().into();
            //                         img.storage_path = Set(Some(path.clone()));
            //                         if let Err(e) = img.update(&state.conn).await {
            //                             log::error!("DB error updating image storage_path: {e}");
            //                         }
            //                     }
            //                 }
            //             }
            //         }
            //     }
            // }

            // Multi-resolution mode: video_formats is a map of resolution → S3 path.
            if let Some(ref formats) = body.video_formats {
                if content_type == ContentType::Video {
                    for (resolution, path) in formats {
                        // Derive format from path extension (e.g. "videos/u/1080p.webm" → "webm")
                        let fmt_ext = path
                            .rsplit_once('.')
                            .map(|(_, ext)| ext.to_lowercase())
                            .unwrap_or_default();
                        if let Ok(Some(fmt)) = VideoFormats::find()
                            .filter(video_formats::Column::VideoId.eq(content_id))
                            .filter(video_formats::Column::Resolution.eq(resolution.as_str()))
                            .filter(video_formats::Column::Format.eq(&fmt_ext))
                            .one(&state.conn)
                            .await
                        {
                            let mut fmt: video_formats::ActiveModel = fmt.into();
                            fmt.storage_path = Set(Some(path.clone()));
                            if let Err(e) = fmt.update(&state.conn).await {
                                log::error!("DB error updating video_format {resolution}: {e}");
                            }
                        } else {
                            let fmt = video_formats::ActiveModel {
                                id: Set(Uuid::new_v4()),
                                video_id: Set(content_id),
                                resolution: Set(resolution.clone()),
                                format: Set(fmt_ext),
                                orig_storage_path: Set(String::new()),
                                storage_path: Set(Some(path.clone())),
                                original_name: Set(String::new()),
                                file_size_bytes: Set(None),
                                created_at: Set(chrono::Utc::now().naive_utc()),
                            };
                            if let Err(e) = fmt.insert(&state.conn).await {
                                log::error!("DB error inserting video_format {resolution}: {e}");
                            }
                        }
                    }
                }
            }

            // Image set processed files (index-based Vec<String>)
            if let Some(ref files) = body.processed_files {
                if content_type == ContentType::ImageSet {
                    if let Ok(imgs) = Images::find()
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

pub async fn cancel_content(
    session: Session,
    state: web::Data<AppState>,
    content_id: web::Path<Uuid>,
) -> HttpResponse {
    let content_id = content_id.into_inner();

    let content = match ContentItems::find_by_id(content_id).one(&state.conn).await {
        Ok(Some(c)) => c,
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

    let session_user_id = auth::get_session_user_id(&session, &state.conn).await;
    if session_user_id != Some(content.uploader_id) {
        return HttpResponse::Forbidden().json(serde_json::json!({
            "error": "Not authorized"
        }));
    }

    // Collect all S3 keys from related records before DB cascade deletes them
    let mut processed_keys: Vec<String> = Vec::new(); // processed bucket
    let mut orig_keys: Vec<String> = Vec::new();      // original bucket

    if let Some(ref url) = content.thumbnail_url {
        processed_keys.push(url.clone());
    }

    match content.r#type {
        ContentType::Video => {
            if let Ok(Some(video)) = Videos::find_by_id(content_id).one(&state.conn).await {
                if let Some(ref path) = video.preview_path {
                    processed_keys.push(path.clone());
                }
            }
            if let Ok(formats) = VideoFormats::find()
                .filter(video_formats::Column::VideoId.eq(content_id))
                .all(&state.conn)
                .await
            {
                for fmt in formats {
                    if !fmt.orig_storage_path.is_empty() {
                        orig_keys.push(fmt.orig_storage_path);
                    }
                    if let Some(ref path) = fmt.storage_path {
                        processed_keys.push(path.clone());
                    }
                }
            }
        }
        ContentType::ImageSet => {
            if let Ok(Some(image_set)) = ImageSets::find_by_id(content_id).one(&state.conn).await {
                if let Some(ref path) = image_set.preview_path {
                    processed_keys.push(path.clone());
                }
            }
            if let Ok(imgs) = Images::find()
                .filter(images::Column::ImageSetId.eq(content_id))
                .all(&state.conn)
                .await
            {
                for img in imgs {
                    if !img.orig_storage_path.is_empty() {
                        orig_keys.push(img.orig_storage_path);
                    }
                    if let Some(ref path) = img.storage_path {
                        processed_keys.push(path.clone());
                    }
                    if let Some(ref path) = img.blurred_storage_path {
                        processed_keys.push(path.clone());
                    }
                }
            }
        }
    }

    // Delete files from processed bucket
    for key in &processed_keys {
        if let Err(e) = state.s3_processed.delete_object(key).await {
            log::warn!("Failed to delete processed file {key}: {e}");
        }
    }

    // Delete files from original bucket
    for key in &orig_keys {
        if let Err(e) = state.s3_orig.delete_object(key).await {
            log::warn!("Failed to delete original file {key}: {e}");
        }
    }

    // Delete from DB
    if let Err(e) = content.delete(&state.conn).await {
        log::error!("DB error deleting content {content_id}: {e}");
        return HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "Failed to delete content"
        }));
    }

    log::info!("Content {content_id} cancelled by uploader, S3 files cleaned up");

    HttpResponse::Ok().json(serde_json::json!({"ok": true}))
}
