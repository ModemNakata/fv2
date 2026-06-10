use actix_multipart::Multipart;
use actix_session::Session;
use actix_web::{HttpResponse, web};
use futures_util::StreamExt;
use s3::Bucket;
use uuid::Uuid;

use crate::auth;
use crate::entity::sea_orm_active_enums::*;
use crate::entity::{content_items, images, image_sets, video_formats, videos};
use sea_orm::{ActiveModelTrait, EntityTrait, Set};
use crate::AppState;

#[derive(serde::Serialize)]
struct UploadResponse {
    ok: bool,
    error: Option<String>,
    content_id: Option<Uuid>,
}

fn s3_key(prefix: &str, id: Uuid, ext: &str) -> String {
    format!("{prefix}/{id}.{ext}")
}

fn mime_for_ext(ext: &str) -> String {
    mime_guess::from_ext(ext)
        .first_or_octet_stream()
        .to_string()
}

async fn s3_put(bucket: &Bucket, key: &str, mime: &str, bytes: &[u8]) -> Result<(), String> {
    match bucket.put_object_with_content_type(key, bytes, mime).await {
        Ok(resp) if resp.status_code() < 300 => Ok(()),
        Ok(resp) => Err(format!("S3 upload failed with status {}", resp.status_code())),
        Err(e) => Err(format!("S3 upload error: {e}")),
    }
}

pub async fn upload_video(
    session: Session,
    state: web::Data<AppState>,
    mut payload: Multipart,
) -> HttpResponse {
    let user = match auth::require_user(&session, &state.conn).await {
        Ok(u) => u,
        Err(resp) => return resp,
    };

    let mut title = String::new();
    let mut description: Option<String> = None;
    let mut file_bytes: Option<Vec<u8>> = None;
    let mut file_ext = String::from("mp4");

    while let Some(Ok(mut field)) = payload.next().await {
        let cd = field.content_disposition().expect("missing content disposition").clone();
        let name = cd.get_name().unwrap_or("").to_string();
        let field_filename = cd.get_filename().map(|f| f.to_string());

        let mut data = Vec::new();
        while let Some(Ok(chunk)) = field.next().await {
            data.extend_from_slice(&chunk);
        }

        match name.as_str() {
            "title" => title = String::from_utf8(data).unwrap_or_default(),
            "description" => {
                let val = String::from_utf8(data).unwrap_or_default();
                if !val.is_empty() {
                    description = Some(val);
                }
            }
            "file" => {
                if let Some(ref filename) = field_filename {
                    if let Some(ext) = filename.rsplit('.').next() {
                        file_ext = ext.to_lowercase();
                    }
                }
                file_bytes = Some(data);
            }
            _ => {}
        }
    }

    if title.is_empty() {
        return HttpResponse::BadRequest().json(UploadResponse {
            ok: false,
            error: Some("Title is required".to_string()),
            content_id: None,
        });
    }

    let bytes = match file_bytes {
        Some(b) => b,
        None => {
            return HttpResponse::BadRequest().json(UploadResponse {
                ok: false,
                error: Some("No file provided".to_string()),
                content_id: None,
            });
        }
    };

    let content_id = Uuid::new_v4();
    let now = chrono::Utc::now().naive_utc();

    let content = content_items::ActiveModel {
        id: Set(content_id),
        uploader_id: Set(user.id),
        r#type: Set(ContentType::Video),
        title: Set(title),
        description: Set(description),
        thumbnail_url: Set(None),
        status: Set(ContentStatus::Uploading),
        visibility: Set(ContentVisibility::Public),
        created_at: Set(now),
        updated_at: Set(now),
    };

    if let Err(e) = content.insert(&state.conn).await {
        log::error!("DB error inserting content_item: {e}");
        return HttpResponse::InternalServerError().json(UploadResponse {
            ok: false,
            error: Some("Failed to create video record".to_string()),
            content_id: None,
        });
    }

    let video = videos::ActiveModel {
        content_id: Set(content_id),
        duration_seconds: Set(None),
        view_count: Set(0),
    };

    if let Err(e) = video.insert(&state.conn).await {
        log::error!("DB error inserting video: {e}");
        return HttpResponse::InternalServerError().json(UploadResponse {
            ok: false,
            error: Some("Failed to create video record".to_string()),
            content_id: None,
        });
    }

    let key = s3_key("videos", content_id, &file_ext);
    let mime = mime_for_ext(&file_ext);

    match s3_put(&state.s3, &key, &mime, &bytes).await {
        Ok(()) => {
            let fmt = video_formats::ActiveModel {
                id: Set(Uuid::new_v4()),
                video_id: Set(content_id),
                resolution: Set("source".to_string()),
                format: Set(file_ext),
                storage_path: Set(key),
                file_size_bytes: Set(Some(bytes.len() as i64)),
                created_at: Set(now),
            };

            if let Err(e) = fmt.insert(&state.conn).await {
                log::error!("DB error inserting video_format: {e}");
            }

            if let Ok(Some(content_model)) =
                content_items::Entity::find_by_id(content_id).one(&state.conn).await
            {
                let mut content: content_items::ActiveModel = content_model.into();
                content.status = Set(ContentStatus::Ready);
                content.updated_at = Set(chrono::Utc::now().naive_utc());
                let _ = content.update(&state.conn).await;
            }

            HttpResponse::Created().json(UploadResponse {
                ok: true,
                error: None,
                content_id: Some(content_id),
            })
        }
        Err(e) => {
            log::error!("{e}");
            HttpResponse::InternalServerError().json(UploadResponse {
                ok: false,
                error: Some("Failed to upload file to storage".to_string()),
                content_id: Some(content_id),
            })
        }
    }
}

pub async fn upload_gallery(
    session: Session,
    state: web::Data<AppState>,
    mut payload: Multipart,
) -> HttpResponse {
    let user = match auth::require_user(&session, &state.conn).await {
        Ok(u) => u,
        Err(resp) => return resp,
    };

    let mut title = String::new();
    let mut description: Option<String> = None;
    let mut files: Vec<(String, Vec<u8>)> = Vec::new();

    while let Some(Ok(mut field)) = payload.next().await {
        let cd = field.content_disposition().expect("missing content disposition").clone();
        let name = cd.get_name().unwrap_or("").to_string();
        let field_filename = cd.get_filename().map(|f| f.to_string());

        let mut data = Vec::new();
        while let Some(Ok(chunk)) = field.next().await {
            data.extend_from_slice(&chunk);
        }

        match name.as_str() {
            "title" => title = String::from_utf8(data).unwrap_or_default(),
            "description" => {
                let val = String::from_utf8(data).unwrap_or_default();
                if !val.is_empty() {
                    description = Some(val);
                }
            }
            "files" => {
                let filename = field_filename.unwrap_or_else(|| "image".to_string());
                files.push((filename, data));
            }
            _ => {}
        }
    }

    if title.is_empty() {
        return HttpResponse::BadRequest().json(UploadResponse {
            ok: false,
            error: Some("Title is required".to_string()),
            content_id: None,
        });
    }

    if files.is_empty() {
        return HttpResponse::BadRequest().json(UploadResponse {
            ok: false,
            error: Some("No files provided".to_string()),
            content_id: None,
        });
    }

    let content_id = Uuid::new_v4();
    let now = chrono::Utc::now().naive_utc();

    let content = content_items::ActiveModel {
        id: Set(content_id),
        uploader_id: Set(user.id),
        r#type: Set(ContentType::ImageSet),
        title: Set(title),
        description: Set(description),
        thumbnail_url: Set(None),
        status: Set(ContentStatus::Uploading),
        visibility: Set(ContentVisibility::Public),
        created_at: Set(now),
        updated_at: Set(now),
    };

    if let Err(e) = content.insert(&state.conn).await {
        log::error!("DB error inserting content_item: {e}");
        return HttpResponse::InternalServerError().json(UploadResponse {
            ok: false,
            error: Some("Failed to create gallery record".to_string()),
            content_id: None,
        });
    }

    let image_set = image_sets::ActiveModel {
        content_id: Set(content_id),
        layout_preference: Set(None),
    };

    if let Err(e) = image_set.insert(&state.conn).await {
        log::error!("DB error inserting image_set: {e}");
        return HttpResponse::InternalServerError().json(UploadResponse {
            ok: false,
            error: Some("Failed to create gallery record".to_string()),
            content_id: None,
        });
    }

    for (i, (filename, bytes)) in files.iter().enumerate() {
        let image_id = Uuid::new_v4();
        let ext = filename
            .rsplit('.')
            .next()
            .map(|e| e.to_lowercase())
            .unwrap_or_else(|| String::from("jpg"));

        let key = s3_key("galleries", image_id, &ext);
        let mime = mime_for_ext(&ext);

        if let Err(e) = s3_put(&state.s3, &key, &mime, bytes).await {
            log::error!("{e} for {filename}");
            continue;
        }

        let image = images::ActiveModel {
            id: Set(image_id),
            image_set_id: Set(content_id),
            storage_path: Set(key),
            sort_order: Set(i as i32),
            alt_text: Set(None),
            created_at: Set(now),
        };

        if let Err(e) = image.insert(&state.conn).await {
            log::error!("DB error inserting image: {e}");
        }
    }

    if let Ok(Some(content_model)) =
        content_items::Entity::find_by_id(content_id).one(&state.conn).await
    {
        let mut content: content_items::ActiveModel = content_model.into();
        content.status = Set(ContentStatus::Ready);
        content.updated_at = Set(chrono::Utc::now().naive_utc());
        let _ = content.update(&state.conn).await;
    }

    HttpResponse::Created().json(UploadResponse {
        ok: true,
        error: None,
        content_id: Some(content_id),
    })
}
