use actix_session::Session;
use actix_web::{HttpResponse, web};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::AppState;
use crate::auth;
use crate::entity::prelude::*;
use crate::entity::sea_orm_active_enums::*;
use crate::entity::{content_items, image_sets, images, video_formats, videos};
use sea_orm::{ActiveModelTrait, EntityTrait, Set};

// ── Request / Response types ──────────────────────────────────────────

#[derive(Deserialize)]
pub struct InitVideoUploadReq {
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    pub price_cents: i32,
    pub extension: String,
    pub original_name: String,
    #[serde(default)]
    pub preview_length: Option<i32>,
    #[serde(default)]
    pub file_size: Option<i64>,
}

#[derive(Deserialize)]
pub struct GalleryFileEntry {
    pub name: String,
    pub ext: String,
    #[serde(default)]
    #[allow(dead_code)]
    pub size: Option<i64>,
}

#[derive(Deserialize)]
pub struct InitGalleryUploadReq {
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    pub price_cents: i32,
    #[serde(default)]
    pub unblurred_count: Option<i32>,
    pub files: Vec<GalleryFileEntry>,
}

#[derive(Serialize)]
pub struct FileUploadUrl {
    pub file_id: Uuid,
    pub file_name: String,
    pub upload_url: String,
}

#[derive(Serialize)]
pub struct InitUploadResponse {
    pub content_id: Uuid,
    pub slug: String,
    pub files: Vec<FileUploadUrl>,
}

#[derive(Serialize)]
pub struct ActionResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

// ── Handlers ──────────────────────────────────────────────────────────

pub async fn init_video_upload(
    session: Session,
    state: web::Data<AppState>,
    req: web::Json<InitVideoUploadReq>,
) -> HttpResponse {
    let user = match auth::require_user(&session, &state.conn).await {
        Ok(u) => u,
        Err(resp) => return resp,
    };

    let content_id = Uuid::new_v4();
    let file_id = Uuid::new_v4();
    let now = chrono::Utc::now().naive_utc();
    let key = format!("videos/{file_id}.{}", req.extension);

    let slug = crate::components::unique_slug(&state.conn, &req.title).await;

    let content = content_items::ActiveModel {
        id: Set(content_id),
        uploader_id: Set(user.id),
        r#type: Set(ContentType::Video),
        title: Set(req.title.clone()),
        slug: Set(Some(slug.clone())),
        description: Set(req.description.clone()),
        thumbnail_url: Set(None),
        status: Set(ContentStatus::Uploading),
        visibility: Set(ContentVisibility::Public),
        created_at: Set(now),
        updated_at: Set(now),
        price_cents: Set(req.price_cents),
        is_paywalled: Set(req.price_cents > 0),
        view_count: Set(0),
        favorite_count: Set(0),
        purchase_count: Set(0),
    };

    if let Err(e) = content.insert(&state.conn).await {
        log::error!("DB error inserting content_item: {e}");
        return HttpResponse::InternalServerError().json(ActionResponse {
            ok: false,
            error: Some("Failed to create record".to_string()),
        });
    }

    let video = videos::ActiveModel {
        content_id: Set(content_id),
        duration_seconds: Set(None),
        source_quality: Set(None),
        source_resolution: Set(None),
        free_preview_duration_s: Set(req.preview_length),
        preview_path: Set(None),
    };

    if let Err(e) = video.insert(&state.conn).await {
        log::error!("DB error inserting video: {e}");
        return HttpResponse::InternalServerError().json(ActionResponse {
            ok: false,
            error: Some("Failed to create record".to_string()),
        });
    }

    let fmt = video_formats::ActiveModel {
        id: Set(Uuid::new_v4()),
        video_id: Set(content_id),
        resolution: Set("original".to_string()),
        format: Set(req.extension.clone()),
        orig_storage_path: Set(key.clone()),
        storage_path: Set(None),
        free_preview_path: Set(None),
        original_name: Set(req.original_name.clone()),
        file_size_bytes: Set(req.file_size),
        created_at: Set(now),
    };

    if let Err(e) = fmt.insert(&state.conn).await {
        log::error!("DB error inserting video_format: {e}");
    }

    // Reject if reported size exceeds limit
    if let Some(size) = req.file_size {
        if size as u64 > state.max_upload_size_video {
            return HttpResponse::BadRequest().json(ActionResponse {
                ok: false,
                error: Some(format!(
                    "File exceeds max upload size of {} bytes",
                    state.max_upload_size_video
                )),
            });
        }
    }

    // !!! THIS still can allow uploading larger files to S3
    // but we can send exact content-length bytes with the URL signature :
    //
    // // Pseudocode depending on your exact `crate::s3::presign_put_with_conditions` implementation
    // // You need to inject the "content-length" header into the signing context:
    // let mut headers = reqwest::header::HeaderMap::new();
    // headers.insert("content-length", req.file_size.unwrap_or(0).to_string().parse().unwrap());
    //
    // // Then pass these signed headers to your S3 SDK presigner
    //
    // Step 2: Make the Browser Send the Header
    // Because the size constraint is now part of the cryptographic signature, your frontend XHR upload must send that exact header, or S3 will reject it with a signature mismatch error.
    // Fortunately, browsers send the Content-Length header automatically when you do xhr.send(file).

    let upload_url = match crate::s3::presign_put_with_conditions(
        &state.s3_orig,
        &key,
        3600,
        1024,
        state.max_upload_size_video,
    )
    .await
    {
        Ok(url) => url,
        Err(e) => {
            log::error!("Failed to generate presigned URL: {e}");
            return HttpResponse::InternalServerError().json(ActionResponse {
                ok: false,
                error: Some("Failed to generate upload URL".to_string()),
            });
        }
    };

    HttpResponse::Ok().json(InitUploadResponse {
        content_id,
        slug,
        files: vec![FileUploadUrl {
            file_id,
            file_name: format!("{}.{}", file_id, req.extension),
            upload_url,
        }],
    })
}

pub async fn init_gallery_upload(
    session: Session,
    state: web::Data<AppState>,
    req: web::Json<InitGalleryUploadReq>,
) -> HttpResponse {
    let user = match auth::require_user(&session, &state.conn).await {
        Ok(u) => u,
        Err(resp) => return resp,
    };

    if req.files.len() > state.max_upload_images_count as usize {
        return HttpResponse::BadRequest().json(ActionResponse {
            ok: false,
            error: Some(format!(
                "Too many files: max {} images per gallery",
                state.max_upload_images_count
            )),
        });
    }

    // Validate unblurred count constraint for paywalled galleries
    if req.price_cents > 0 {
        let unblurred = req.unblurred_count.unwrap_or(1).max(1);
        if (req.files.len() as i32) < unblurred * 2 {
            return HttpResponse::BadRequest().json(ActionResponse {
                ok: false,
                error: Some(format!(
                    "Need at least {} images for {unblurred} unblurred (have {})",
                    unblurred * 2,
                    req.files.len(),
                )),
            });
        }
    }

    let content_id = Uuid::new_v4();
    let now = chrono::Utc::now().naive_utc();

    let slug = crate::components::unique_slug(&state.conn, &req.title).await;

    let content = content_items::ActiveModel {
        id: Set(content_id),
        uploader_id: Set(user.id),
        r#type: Set(ContentType::ImageSet),
        title: Set(req.title.clone()),
        slug: Set(Some(slug.clone())),
        description: Set(req.description.clone()),
        thumbnail_url: Set(None),
        status: Set(ContentStatus::Uploading),
        visibility: Set(ContentVisibility::Public),
        created_at: Set(now),
        updated_at: Set(now),
        price_cents: Set(req.price_cents),
        is_paywalled: Set(req.price_cents > 0),
        view_count: Set(0),
        favorite_count: Set(0),
        purchase_count: Set(0),
    };

    if let Err(e) = content.insert(&state.conn).await {
        log::error!("DB error inserting content_item: {e}");
        return HttpResponse::InternalServerError().json(ActionResponse {
            ok: false,
            error: Some("Failed to create record".to_string()),
        });
    }

    let image_set = image_sets::ActiveModel {
        content_id: Set(content_id),
        layout_preference: Set(None),
        preview_path: Set(None),
        unblurred_count: Set(req.unblurred_count),
    };

    if let Err(e) = image_set.insert(&state.conn).await {
        log::error!("DB error inserting image_set: {e}");
        return HttpResponse::InternalServerError().json(ActionResponse {
            ok: false,
            error: Some("Failed to create record".to_string()),
        });
    }

    // Reject if any file exceeds per-file size limit
    for f in &req.files {
        if let Some(size) = f.size {
            if size as u64 > state.max_upload_size_gallery {
                return HttpResponse::BadRequest().json(ActionResponse {
                    ok: false,
                    error: Some(format!(
                        "File '{}' exceeds max upload size of {} bytes",
                        f.name, state.max_upload_size_gallery
                    )),
                });
            }
        }
    }

    let prefix = format!("galleries/{}", content_id);
    let mut file_urls = Vec::with_capacity(req.files.len());

    for (i, f) in req.files.iter().enumerate() {
        let file_id = Uuid::new_v4();
        let key = format!("{prefix}/{file_id}.{}", f.ext);

        let image = images::ActiveModel {
            id: Set(file_id),
            image_set_id: Set(content_id),
            orig_storage_path: Set(key.clone()),
            storage_path: Set(None),
            original_name: Set(f.name.clone()),
            sort_order: Set(i as i32),
            alt_text: Set(None),
            blurred_storage_path: Set(None),
            created_at: Set(now),
        };

        if let Err(e) = image.insert(&state.conn).await {
            log::error!("DB error inserting image: {e}");
        }

        let upload_url = match crate::s3::presign_put_with_conditions(
            &state.s3_orig,
            &key,
            3600,
            1024,
            state.max_upload_size_gallery,
        )
        .await
        {
            Ok(url) => url,
            Err(e) => {
                log::error!("Failed to generate presigned URL for {}: {e}", f.name);
                continue;
            }
        };

        file_urls.push(FileUploadUrl {
            file_id,
            file_name: f.name.clone(),
            upload_url,
        });
    }

    HttpResponse::Ok().json(InitUploadResponse {
        content_id,
        slug,
        files: file_urls,
    })
}

pub async fn complete_upload(
    session: Session,
    state: web::Data<AppState>,
    content_id: web::Path<Uuid>,
) -> HttpResponse {
    let user = match auth::require_user(&session, &state.conn).await {
        Ok(u) => u,
        Err(resp) => return resp,
    };

    let content_id = content_id.into_inner();

    match ContentItems::find_by_id(content_id).one(&state.conn).await {
        Ok(Some(content_model)) => {
            if content_model.uploader_id != user.id {
                return HttpResponse::Forbidden().json(ActionResponse {
                    ok: false,
                    error: Some("Not your content".to_string()),
                });
            }

            let mut content: content_items::ActiveModel = content_model.into();
            content.status = Set(ContentStatus::Processing);
            content.updated_at = Set(chrono::Utc::now().naive_utc());
            if let Err(e) = content.update(&state.conn).await {
                log::error!("DB error updating status: {e}");
                return HttpResponse::InternalServerError().json(ActionResponse {
                    ok: false,
                    error: Some("Failed to update status".to_string()),
                });
            }

            HttpResponse::Ok().json(ActionResponse {
                ok: true,
                error: None,
            })
        }
        Ok(None) => HttpResponse::NotFound().json(ActionResponse {
            ok: false,
            error: Some("Content not found".to_string()),
        }),
        Err(e) => {
            log::error!("DB error fetching content: {e}");
            HttpResponse::InternalServerError().json(ActionResponse {
                ok: false,
                error: Some("Database error".to_string()),
            })
        }
    }
}
