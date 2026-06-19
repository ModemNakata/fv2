use actix_session::Session;
use actix_web::{HttpResponse, web};
use askama::Template;
use sea_orm::*;
use serde::Serialize;
use uuid::Uuid;

use crate::AppState;
use crate::auth;
use crate::entity::prelude::*;
use crate::entity::sea_orm_active_enums::*;
use crate::entity::{content_items, image_sets, images, users};
use crate::gallery;

// ---- page handler ----

#[derive(Template)]
#[template(path = "profile.html")]
struct ProfilePage {
    username: String,
    logged_in: bool,
    is_owner: bool,
    session_avatar_url: Option<String>,
    display_name: String,
    handle: String,
    avatar_url: Option<String>,
    about_me: Option<String>,
    follower_count: String,
    following_count: String,
    profile_views: String,
    active_tab: String,
    version: String,
    video_count: i64,
    gallery_count: i64,
    profile_user_id: Uuid,
}

pub async fn user_profile(
    session: Session,
    state: web::Data<AppState>,
    username: web::Path<String>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> HttpResponse {
    let session_user = auth::get_session_user(&session, &state.conn).await;
    let logged_in = session_user.is_some();

    let profile_username = username.into_inner();
    let is_owner = session_user.as_ref().map(|u| u.username.as_str()) == Some(&profile_username);

    let user = match Users::find()
        .filter(users::Column::Username.eq(&profile_username))
        .one(&state.conn)
        .await
    {
        Ok(Some(u)) => u,
        Ok(None) => return HttpResponse::NotFound().body("User not found"),
        Err(e) => {
            log::error!("DB error fetching user: {e}");
            return HttpResponse::InternalServerError().body("Database error");
        }
    };

    let video_count = ContentItems::find()
        .filter(content_items::Column::UploaderId.eq(user.id))
        .filter(content_items::Column::Type.eq(ContentType::Video))
        .filter(content_items::Column::Status.eq(ContentStatus::Ready))
        .filter(content_items::Column::Visibility.eq(ContentVisibility::Public))
        .count(&state.conn)
        .await
        .unwrap_or(0);

    let gallery_count = ContentItems::find()
        .filter(content_items::Column::UploaderId.eq(user.id))
        .filter(content_items::Column::Type.eq(ContentType::ImageSet))
        .filter(content_items::Column::Status.eq(ContentStatus::Ready))
        .filter(content_items::Column::Visibility.eq(ContentVisibility::Public))
        .count(&state.conn)
        .await
        .unwrap_or(0);

    let default_tab = if gallery_count > video_count {
        "galleries"
    } else {
        "videos"
    };
    let active_tab = query
        .get("tab")
        .filter(|v| *v == "videos" || *v == "galleries")
        .map(String::as_str)
        .unwrap_or(default_tab)
        .to_string();

    let profile_user_id = user.id;
    let html = ProfilePage {
        username: session_user.as_ref().map(|u| u.username.clone()).unwrap_or_default(),
        logged_in,
        is_owner,
        session_avatar_url: session_user.and_then(|u| u.avatar_url),
        display_name: user.display_name,
        handle: user.username,
        avatar_url: user.avatar_url,
        about_me: user.about_me,
        follower_count: "1.2K".to_string(),
        following_count: "42".to_string(),
        profile_views: crate::components::format_view_count(user.view_count),
        active_tab,
        video_count: video_count as i64,
        gallery_count: gallery_count as i64,
        profile_user_id,
        version: state.static_version.clone(),
    }
    .render()
    .expect("profile.html should be valid");

    HttpResponse::Ok().body(html)
}

// ---- API: videos ----

#[derive(Serialize)]
struct ApiVideoItem {
    id: Uuid,
    title: String,
    thumbnail_url: Option<String>,
    preview_url: Option<String>,
    duration: String,
    views: String,
    favourite_count: String,
    time_ago: String,
    hue: u32,
}

#[derive(Serialize)]
struct ApiVideosResponse {
    items: Vec<ApiVideoItem>,
    has_more: bool,
}

pub async fn api_videos(
    state: web::Data<AppState>,
    username: web::Path<String>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> HttpResponse {
    let username = username.into_inner();

    let limit: u64 = query
        .get("limit")
        .and_then(|v| v.parse().ok())
        .unwrap_or(20)
        .min(50);

    let offset: u64 = query
        .get("offset")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

    let user = match Users::find()
        .filter(users::Column::Username.eq(&username))
        .one(&state.conn)
        .await
    {
        Ok(Some(u)) => u,
        _ => {
            return HttpResponse::Ok().json(ApiVideosResponse {
                items: Vec::new(),
                has_more: false,
            });
        }
    };

    let total = ContentItems::find()
        .filter(content_items::Column::UploaderId.eq(user.id))
        .filter(content_items::Column::Type.eq(ContentType::Video))
        .filter(content_items::Column::Status.eq(ContentStatus::Ready))
        .filter(content_items::Column::Visibility.eq(ContentVisibility::Public))
        .count(&state.conn)
        .await
        .unwrap_or(0);

    let items = ContentItems::find()
        .filter(content_items::Column::UploaderId.eq(user.id))
        .filter(content_items::Column::Type.eq(ContentType::Video))
        .filter(content_items::Column::Status.eq(ContentStatus::Ready))
        .filter(content_items::Column::Visibility.eq(ContentVisibility::Public))
        .order_by_desc(content_items::Column::CreatedAt)
        .limit(limit)
        .offset(offset)
        .find_also_related(Videos)
        .all(&state.conn)
        .await
        .unwrap_or_default();

    let s3_endpoint = std::env::var("PUBLIC_S3_ENDPOINT").unwrap_or_default();
    let s3_bucket = std::env::var("S3_BUCKET").unwrap_or_default();
    let s3_base = if s3_endpoint.is_empty() || s3_bucket.is_empty() {
        String::new()
    } else {
        format!("{}/{}", s3_endpoint.trim_end_matches('/'), s3_bucket)
    };

    let now = chrono::Utc::now();

    let video_items: Vec<ApiVideoItem> = items
        .into_iter()
        .map(|(content, video_opt)| {
            let duration_secs = video_opt
                .as_ref()
                .and_then(|v| v.duration_seconds)
                .unwrap_or(0);
            let hours = duration_secs / 3600;
            let minutes = (duration_secs % 3600) / 60;
            let secs = duration_secs % 60;
            let duration_str = if hours > 0 {
                format!("{}:{:02}:{:02}", hours, minutes, secs)
            } else {
                format!("{}:{:02}", minutes, secs)
            };

            let favourite_count = content.favorite_count.to_string();

            let hue = (content
                .id
                .to_string()
                .bytes()
                .fold(0u32, |acc, b| acc.wrapping_add(b as u32))
                * 37)
                % 360;

            let thumbnail_url = content
                .thumbnail_url
                .filter(|k| !k.is_empty())
                .map(|key| format!("{}/{}", s3_base, key));

            let preview_url = video_opt
                .as_ref()
                .and_then(|v| v.preview_path.as_ref())
                .filter(|k| !k.is_empty())
                .map(|key| format!("{}/{}", s3_base, key));

            ApiVideoItem {
                id: content.id,
                title: content.title,
                thumbnail_url,
                preview_url,
                duration: duration_str,
                views: crate::components::format_view_count(content.view_count),
                favourite_count,
                time_ago: gallery::time_ago(&content.created_at, now),
                hue,
            }
        })
        .collect();

    let has_more = (offset as u64 + limit) < total;

    HttpResponse::Ok().json(ApiVideosResponse {
        items: video_items,
        has_more,
    })
}

// ---- API: galleries ----

#[derive(Serialize)]
struct ApiGalleryItem {
    id: Uuid,
    title: String,
    thumbnail_url: Option<String>,
    image_count: usize,
    views: String,
    favourite_count: String,
    time_ago: String,
}

#[derive(Serialize)]
struct ApiGalleriesResponse {
    items: Vec<ApiGalleryItem>,
    has_more: bool,
}

pub async fn api_galleries(
    state: web::Data<AppState>,
    username: web::Path<String>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> HttpResponse {
    let username = username.into_inner();

    let limit: u64 = query
        .get("limit")
        .and_then(|v| v.parse().ok())
        .unwrap_or(20)
        .min(50);

    let offset: u64 = query
        .get("offset")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

    let user = match Users::find()
        .filter(users::Column::Username.eq(&username))
        .one(&state.conn)
        .await
    {
        Ok(Some(u)) => u,
        _ => {
            return HttpResponse::Ok().json(ApiGalleriesResponse {
                items: Vec::new(),
                has_more: false,
            });
        }
    };

    let total = ContentItems::find()
        .filter(content_items::Column::UploaderId.eq(user.id))
        .filter(content_items::Column::Type.eq(ContentType::ImageSet))
        .filter(content_items::Column::Status.eq(ContentStatus::Ready))
        .filter(content_items::Column::Visibility.eq(ContentVisibility::Public))
        .count(&state.conn)
        .await
        .unwrap_or(0);

    let gallery_items = ContentItems::find()
        .filter(content_items::Column::UploaderId.eq(user.id))
        .filter(content_items::Column::Type.eq(ContentType::ImageSet))
        .filter(content_items::Column::Status.eq(ContentStatus::Ready))
        .filter(content_items::Column::Visibility.eq(ContentVisibility::Public))
        .order_by_desc(content_items::Column::CreatedAt)
        .limit(limit)
        .offset(offset)
        .all(&state.conn)
        .await
        .unwrap_or_default();

    let ids: Vec<Uuid> = gallery_items.iter().map(|c| c.id).collect();

    let image_set_map: std::collections::HashMap<Uuid, image_sets::Model> = if !ids.is_empty() {
        let all = ImageSets::find()
            .filter(image_sets::Column::ContentId.is_in(ids.clone()))
            .all(&state.conn)
            .await
            .unwrap_or_default();
        let mut map = std::collections::HashMap::new();
        for img_set in all {
            map.insert(img_set.content_id, img_set);
        }
        map
    } else {
        std::collections::HashMap::new()
    };

    let image_map: std::collections::HashMap<Uuid, Vec<images::Model>> = if !ids.is_empty() {
        let all = Images::find()
            .filter(images::Column::ImageSetId.is_in(ids))
            .order_by(images::Column::SortOrder, sea_orm::Order::Asc)
            .all(&state.conn)
            .await
            .unwrap_or_default();
        let mut map: std::collections::HashMap<Uuid, Vec<images::Model>> =
            std::collections::HashMap::new();
        for img in all {
            map.entry(img.image_set_id).or_default().push(img);
        }
        map
    } else {
        std::collections::HashMap::new()
    };

    let s3_endpoint = std::env::var("PUBLIC_S3_ENDPOINT").unwrap_or_default();
    let s3_bucket = std::env::var("S3_BUCKET").unwrap_or_default();
    let s3_base = if s3_endpoint.is_empty() || s3_bucket.is_empty() {
        String::new()
    } else {
        format!("{}/{}", s3_endpoint.trim_end_matches('/'), s3_bucket)
    };

    let now = chrono::Utc::now();

    let items: Vec<ApiGalleryItem> = gallery_items
        .into_iter()
        .map(|content| {
            let image_set = image_set_map.get(&content.id);
            let imgs = image_map.get(&content.id);
            let image_count = imgs.map(|v| v.len()).unwrap_or(0);

            let thumbnail_url = image_set
                .and_then(|is| is.preview_path.as_ref())
                .or_else(|| {
                    imgs.and_then(|imgs| imgs.first())
                        .map(|img| img.storage_path.as_ref().unwrap_or(&img.orig_storage_path))
                })
                .map(|path| format!("{}/{}", s3_base, path));

            let favourite_count = content.favorite_count.to_string();

            ApiGalleryItem {
                id: content.id,
                title: content.title,
                thumbnail_url,
                image_count,
                views: crate::components::format_view_count(content.view_count),
                favourite_count,
                time_ago: gallery::time_ago(&content.created_at, now),
            }
        })
        .collect();

    let has_more = (offset as u64 + limit) < total;

    HttpResponse::Ok().json(ApiGalleriesResponse {
        items,
        has_more,
    })
}

// ---- API: followers / following ----

#[derive(Serialize)]
struct ProfileCard {
    handle: String,
    display_name: String,
    avatar_url: Option<String>,
    follower_count: String,
}

#[derive(Serialize)]
struct ApiFollowersResponse {
    items: Vec<ProfileCard>,
    has_more: bool,
}

fn mock_profile_cards() -> Vec<ProfileCard> {
    vec![
        ProfileCard {
            handle: "alice".into(),
            display_name: "Alice".into(),
            avatar_url: None,
            follower_count: "1.1K".into(),
        },
        ProfileCard {
            handle: "bob".into(),
            display_name: "Bob".into(),
            avatar_url: None,
            follower_count: "856".into(),
        },
        ProfileCard {
            handle: "charlie".into(),
            display_name: "Charlie".into(),
            avatar_url: None,
            follower_count: "2.3K".into(),
        },
        ProfileCard {
            handle: "diana".into(),
            display_name: "Diana".into(),
            avatar_url: None,
            follower_count: "412".into(),
        },
        ProfileCard {
            handle: "eve".into(),
            display_name: "Eve".into(),
            avatar_url: None,
            follower_count: "1.8K".into(),
        },
        ProfileCard {
            handle: "frank".into(),
            display_name: "Frank".into(),
            avatar_url: None,
            follower_count: "234".into(),
        },
        ProfileCard {
            handle: "grace".into(),
            display_name: "Grace".into(),
            avatar_url: None,
            follower_count: "3.1K".into(),
        },
        ProfileCard {
            handle: "henry".into(),
            display_name: "Henry".into(),
            avatar_url: None,
            follower_count: "789".into(),
        },
        ProfileCard {
            handle: "ivy".into(),
            display_name: "Ivy".into(),
            avatar_url: None,
            follower_count: "567".into(),
        },
        ProfileCard {
            handle: "jack".into(),
            display_name: "Jack".into(),
            avatar_url: None,
            follower_count: "1.0K".into(),
        },
        ProfileCard {
            handle: "kate".into(),
            display_name: "Kate".into(),
            avatar_url: None,
            follower_count: "923".into(),
        },
        ProfileCard {
            handle: "leo".into(),
            display_name: "Leo".into(),
            avatar_url: None,
            follower_count: "2.0K".into(),
        },
    ]
}

pub async fn api_followers(
    _username: web::Path<String>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> HttpResponse {
    let limit: usize = query
        .get("limit")
        .and_then(|v| v.parse().ok())
        .unwrap_or(20)
        .min(50);
    let offset: usize = query
        .get("offset")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

    let all = mock_profile_cards();
    let total = all.len();
    let items: Vec<ProfileCard> = all.into_iter().skip(offset).take(limit).collect();
    let has_more = (offset + limit) < total;

    HttpResponse::Ok().json(ApiFollowersResponse { items, has_more })
}

pub async fn api_following(
    _username: web::Path<String>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> HttpResponse {
    let limit: usize = query
        .get("limit")
        .and_then(|v| v.parse().ok())
        .unwrap_or(20)
        .min(50);
    let offset: usize = query
        .get("offset")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

    let all = mock_profile_cards();
    let total = all.len();
    let items: Vec<ProfileCard> = all.into_iter().skip(offset).take(limit).collect();
    let has_more = (offset + limit) < total;

    HttpResponse::Ok().json(ApiFollowersResponse { items, has_more })
}
