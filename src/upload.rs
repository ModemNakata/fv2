use actix_multipart::Multipart;
use actix_session::Session;
use actix_web::{HttpResponse, web};
use futures_util::StreamExt;
use uuid::Uuid;

use crate::AppState;
use crate::auth;
use crate::entity::prelude::*;
use crate::entity::sea_orm_active_enums::*;
use crate::entity::{content_items, image_sets, images, users, video_formats, videos};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};

const MIN_PART_SIZE: usize = 5 * 1024 * 1024; // 5MB

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

async fn s3_put_stream(
    bucket: &::s3::Bucket,
    key: &str,
    mime: &str,
    mut field: actix_multipart::Field,
) -> Result<u64, String> {
    let init = bucket
        .initiate_multipart_upload(key, mime)
        .await
        .map_err(|e| format!("init multipart: {e}"))?;
    let upload_id = init.upload_id;

    let mut buf = Vec::with_capacity(MIN_PART_SIZE);
    let mut part_num: u32 = 1;
    let mut parts = Vec::new();
    let mut total: u64 = 0;

    loop {
        match field.next().await {
            Some(Ok(chunk)) => {
                total += chunk.len() as u64;
                buf.extend_from_slice(&chunk);
                if buf.len() >= MIN_PART_SIZE {
                    let data = std::mem::replace(&mut buf, Vec::with_capacity(MIN_PART_SIZE));
                    match bucket
                        .put_multipart_chunk(data, key, part_num, &upload_id, "")
                        .await
                    {
                        Ok(p) => parts.push(p),
                        Err(e) => {
                            let _ = bucket.abort_upload(key, &upload_id).await;
                            return Err(format!("part {part_num}: {e}"));
                        }
                    }
                    part_num += 1;
                }
            }
            Some(Err(e)) => {
                let _ = bucket.abort_upload(key, &upload_id).await;
                return Err(format!("stream error: {e}"));
            }
            None => break,
        }
    }

    let last = std::mem::replace(&mut buf, Vec::new());
    match bucket
        .put_multipart_chunk(last, key, part_num, &upload_id, "")
        .await
    {
        Ok(p) => parts.push(p),
        Err(e) => {
            let _ = bucket.abort_upload(key, &upload_id).await;
            return Err(format!("final part: {e}"));
        }
    }

    bucket
        .complete_multipart_upload(key, &upload_id, parts)
        .await
        .map_err(|e| {
            let _ = bucket.abort_upload(key, &upload_id);
            format!("complete: {e}")
        })?;

    Ok(total)
}

struct UploadedFile {
    id: Uuid,
    ext: String,
    size: u64,
}

async fn resolve_user(session: &Session, state: &AppState) -> Option<users::Model> {
    let username = auth::get_session_user(session, &state.conn).await?;
    Users::find()
        .filter(users::Column::Username.eq(&username))
        .one(&state.conn)
        .await
        .ok()
        .flatten()
}

async fn cleanup_s3(bucket: &::s3::Bucket, prefix: &str, files: &[UploadedFile]) {
    for f in files {
        let _ = bucket.delete_object(&s3_key(prefix, f.id, &f.ext)).await;
    }
}

pub async fn upload_video(
    session: Session,
    state: web::Data<AppState>,
    mut payload: Multipart,
) -> HttpResponse {
    let user = match resolve_user(&session, &state).await {
        Some(u) => u,
        None => {
            return HttpResponse::Unauthorized().json(UploadResponse {
                ok: false,
                error: Some("Not signed in".to_string()),
                content_id: None,
            });
        }
    };

    let mut title = String::new();
    let mut description: Option<String> = None;
    let mut uploaded: Option<UploadedFile> = None;

    while let Some(Ok(mut field)) = payload.next().await {
        let cd = field
            .content_disposition()
            .expect("missing content disposition")
            .clone();
        let name = cd.get_name().unwrap_or("").to_string();
        let field_filename = cd.get_filename().map(|f| f.to_string());

        match name.as_str() {
            "title" => {
                let mut data = Vec::new();
                while let Some(Ok(chunk)) = field.next().await {
                    data.extend_from_slice(&chunk);
                }
                title = String::from_utf8(data).unwrap_or_default();
            }
            "description" => {
                let mut data = Vec::new();
                while let Some(Ok(chunk)) = field.next().await {
                    data.extend_from_slice(&chunk);
                }
                let val = String::from_utf8(data).unwrap_or_default();
                if !val.is_empty() {
                    description = Some(val);
                }
            }
            "file" => {
                let ext = match field_filename
                    .as_ref()
                    .and_then(|f| f.rsplit('.').next().map(|e| e.to_lowercase()))
                {
                    Some(e) => e,
                    None => {
                        return HttpResponse::BadRequest().json(UploadResponse {
                            ok: false,
                            error: Some("Could not determine file extension".to_string()),
                            content_id: None,
                        });
                    }
                };

                let file_id = Uuid::new_v4();
                let key = s3_key("videos", file_id, &ext);
                let mime = mime_for_ext(&ext);

                match s3_put_stream(&state.s3, &key, &mime, field).await {
                    Ok(size) => {
                        uploaded = Some(UploadedFile {
                            id: file_id,
                            ext,
                            size,
                        });
                    }
                    Err(e) => {
                        log::error!("S3 upload failed: {e}");
                        return HttpResponse::InternalServerError().json(UploadResponse {
                            ok: false,
                            error: Some("Upload failed".to_string()),
                            content_id: None,
                        });
                    }
                }
            }
            _ => {}
        }
    }

    if title.is_empty() {
        if let Some(ref f) = uploaded {
            let _ = state
                .s3
                .delete_object(&s3_key("videos", f.id, &f.ext))
                .await;
        }
        return HttpResponse::BadRequest().json(UploadResponse {
            ok: false,
            error: Some("Title is required".to_string()),
            content_id: None,
        });
    }

    let file = match uploaded {
        Some(f) => f,
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
        let _ = state
            .s3
            .delete_object(&s3_key("videos", file.id, &file.ext))
            .await;
        return HttpResponse::InternalServerError().json(UploadResponse {
            ok: false,
            error: Some("Failed to create record".to_string()),
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
            error: Some("Failed to create record".to_string()),
            content_id: None,
        });
    }

    let fmt = video_formats::ActiveModel {
        id: Set(Uuid::new_v4()),
        video_id: Set(content_id),
        resolution: Set("original".to_string()),
        format: Set(file.ext.clone()),
        storage_path: Set(s3_key("videos", file.id, &file.ext)),
        file_size_bytes: Set(Some(file.size as i64)),
        created_at: Set(now),
    };

    if let Err(e) = fmt.insert(&state.conn).await {
        log::error!("DB error inserting video_format: {e}");
    }

    if let Ok(Some(content_model)) = content_items::Entity::find_by_id(content_id)
        .one(&state.conn)
        .await
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

pub async fn upload_gallery(
    session: Session,
    state: web::Data<AppState>,
    mut payload: Multipart,
) -> HttpResponse {
    let user = match resolve_user(&session, &state).await {
        Some(u) => u,
        None => {
            return HttpResponse::Unauthorized().json(UploadResponse {
                ok: false,
                error: Some("Not signed in".to_string()),
                content_id: None,
            });
        }
    };

    let mut title = String::new();
    let mut description: Option<String> = None;
    let mut uploaded: Vec<UploadedFile> = Vec::new();

    while let Some(Ok(mut field)) = payload.next().await {
        let cd = field
            .content_disposition()
            .expect("missing content disposition")
            .clone();
        let name = cd.get_name().unwrap_or("").to_string();
        let field_filename = cd.get_filename().map(|f| f.to_string());

        match name.as_str() {
            "title" => {
                let mut data = Vec::new();
                while let Some(Ok(chunk)) = field.next().await {
                    data.extend_from_slice(&chunk);
                }
                title = String::from_utf8(data).unwrap_or_default();
            }
            "description" => {
                let mut data = Vec::new();
                while let Some(Ok(chunk)) = field.next().await {
                    data.extend_from_slice(&chunk);
                }
                let val = String::from_utf8(data).unwrap_or_default();
                if !val.is_empty() {
                    description = Some(val);
                }
            }
            "files" => {
                let ext = match field_filename
                    .as_ref()
                    .and_then(|f| f.rsplit('.').next().map(|e| e.to_lowercase()))
                {
                    Some(e) => e,
                    None => {
                        cleanup_s3(&state.s3, "galleries", &uploaded).await;
                        return HttpResponse::BadRequest().json(UploadResponse {
                            ok: false,
                            error: Some("Could not determine file extension".to_string()),
                            content_id: None,
                        });
                    }
                };

                let file_id = Uuid::new_v4();
                let key = s3_key("galleries", file_id, &ext);
                let mime = mime_for_ext(&ext);

                match s3_put_stream(&state.s3, &key, &mime, field).await {
                    Ok(size) => {
                        uploaded.push(UploadedFile {
                            id: file_id,
                            ext,
                            size,
                        });
                    }
                    Err(e) => {
                        log::error!("S3 upload failed: {e}");
                        cleanup_s3(&state.s3, "galleries", &uploaded).await;
                        return HttpResponse::InternalServerError().json(UploadResponse {
                            ok: false,
                            error: Some("Upload failed".to_string()),
                            content_id: None,
                        });
                    }
                }
            }
            _ => {}
        }
    }

    if title.is_empty() {
        cleanup_s3(&state.s3, "galleries", &uploaded).await;
        return HttpResponse::BadRequest().json(UploadResponse {
            ok: false,
            error: Some("Title is required".to_string()),
            content_id: None,
        });
    }

    if uploaded.is_empty() {
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
        cleanup_s3(&state.s3, "galleries", &uploaded).await;
        return HttpResponse::InternalServerError().json(UploadResponse {
            ok: false,
            error: Some("Failed to create record".to_string()),
            content_id: None,
        });
    }

    let image_set = image_sets::ActiveModel {
        content_id: Set(content_id),
        layout_preference: Set(None),
    };

    if let Err(e) = image_set.insert(&state.conn).await {
        log::error!("DB error inserting image_set: {e}");
        cleanup_s3(&state.s3, "galleries", &uploaded).await;
        return HttpResponse::InternalServerError().json(UploadResponse {
            ok: false,
            error: Some("Failed to create record".to_string()),
            content_id: None,
        });
    }

    for (i, f) in uploaded.iter().enumerate() {
        let image = images::ActiveModel {
            id: Set(f.id),
            image_set_id: Set(content_id),
            storage_path: Set(s3_key("galleries", f.id, &f.ext)),
            sort_order: Set(i as i32),
            alt_text: Set(None),
            created_at: Set(now),
        };

        if let Err(e) = image.insert(&state.conn).await {
            log::error!("DB error inserting image: {e}");
        }
    }

    if let Ok(Some(content_model)) = content_items::Entity::find_by_id(content_id)
        .one(&state.conn)
        .await
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
