use actix_web::{HttpResponse, web};
use chrono::{DateTime, FixedOffset, NaiveDateTime, Utc};
use sea_orm::*;
use sitemap_rs::sitemap::Sitemap;
use sitemap_rs::sitemap_index::SitemapIndex;
use sitemap_rs::url::{ChangeFrequency, Url};
use sitemap_rs::url_set::UrlSet;
use uuid::Uuid;

use crate::entity::content_items;
use crate::entity::prelude::*;
use crate::entity::sea_orm_active_enums::*;
use crate::entity::users;
use crate::AppState;

fn naive_to_fixed(dt: NaiveDateTime) -> DateTime<FixedOffset> {
    DateTime::from_naive_utc_and_offset(dt, FixedOffset::east_opt(0).unwrap())
}

fn now_fixed() -> DateTime<FixedOffset> {
    naive_to_fixed(Utc::now().naive_utc())
}

fn make_url(
    loc: String,
    priority: f32,
    changefreq: ChangeFrequency,
    lastmod: Option<NaiveDateTime>,
) -> Url {
    let mut builder = Url::builder(loc);
    builder.priority(priority).change_frequency(changefreq);
    if let Some(dt) = lastmod {
        builder.last_modified(naive_to_fixed(dt));
    }
    builder.build().unwrap()
}

fn xml_response(buf: Vec<u8>) -> HttpResponse {
    HttpResponse::Ok()
        .content_type("application/xml")
        .body(buf)
}

fn make_sub_sitemap(site_url: &str, name: &str) -> Sitemap {
    Sitemap::new(
        format!("{}/sitemap-{}.xml", site_url.trim_end_matches('/'), name),
        Some(now_fixed()),
    )
}

// ── Sitemap index ────────────────────────────────────────────────────────────

pub async fn index(state: web::Data<AppState>) -> HttpResponse {
    let sitemaps = vec![
        make_sub_sitemap(&state.site_url, "static"),
        make_sub_sitemap(&state.site_url, "videos"),
        make_sub_sitemap(&state.site_url, "galleries"),
        make_sub_sitemap(&state.site_url, "profiles"),
    ];
    match SitemapIndex::new(sitemaps) {
        Ok(idx) => {
            let mut buf = Vec::new();
            match idx.write(&mut buf) {
                Ok(()) => xml_response(buf),
                Err(e) => {
                    log::error!("Failed to write sitemap index XML: {e}");
                    HttpResponse::InternalServerError().finish()
                }
            }
        }
        Err(e) => {
            log::error!("Failed to build sitemap index: {e}");
            HttpResponse::InternalServerError().finish()
        }
    }
}

// ── Static pages sub-sitemap ─────────────────────────────────────────────────

pub async fn static_pages(state: web::Data<AppState>) -> HttpResponse {
    let base = state.site_url.trim_end_matches('/');

    let pages: Vec<(&str, f32, ChangeFrequency)> = vec![
        ("/", 1.0, ChangeFrequency::Daily),
        ("/gallery", 0.8, ChangeFrequency::Daily),
        ("/privacy", 0.5, ChangeFrequency::Monthly),
        ("/terms", 0.5, ChangeFrequency::Monthly),
        ("/contact", 0.5, ChangeFrequency::Monthly),
        ("/dmca", 0.5, ChangeFrequency::Monthly),
        ("/aup", 0.5, ChangeFrequency::Monthly),
        ("/refund", 0.3, ChangeFrequency::Monthly),
        ("/compliance", 0.3, ChangeFrequency::Monthly),
    ];

    let urls: Vec<Url> = pages
        .into_iter()
        .map(|(path, pri, cf)| make_url(format!("{base}{path}"), pri, cf, None))
        .collect();

    match UrlSet::new(urls) {
        Ok(set) => {
            let mut buf = Vec::new();
            match set.write(&mut buf) {
                Ok(()) => xml_response(buf),
                Err(e) => {
                    log::error!("Failed to write static sitemap XML: {e}");
                    HttpResponse::InternalServerError().finish()
                }
            }
        }
        Err(e) => {
            log::error!("Failed to build static sitemap: {e}");
            HttpResponse::InternalServerError().finish()
        }
    }
}

// ── Videos sub-sitemap ───────────────────────────────────────────────────────

pub async fn videos(state: web::Data<AppState>) -> HttpResponse {
    let base = state.site_url.trim_end_matches('/');

    let items = match ContentItems::find()
        .filter(content_items::Column::Type.eq(ContentType::Video))
        .filter(content_items::Column::Status.eq(ContentStatus::Ready))
        .filter(content_items::Column::Visibility.eq(ContentVisibility::Public))
        .order_by_desc(content_items::Column::CreatedAt)
        .all(&state.conn)
        .await
    {
        Ok(items) => items,
        Err(e) => {
            log::error!("DB error fetching videos for sitemap: {e}");
            return HttpResponse::InternalServerError().finish();
        }
    };

    let urls: Vec<Url> = items
        .into_iter()
        .filter_map(|c| {
            let slug = c.slug?;
            let loc = format!("{base}/v/{slug}");
            Some(make_url(loc, 0.9, ChangeFrequency::Weekly, Some(c.updated_at)))
        })
        .collect();

    match UrlSet::new(urls) {
        Ok(set) => {
            let mut buf = Vec::new();
            match set.write(&mut buf) {
                Ok(()) => xml_response(buf),
                Err(e) => {
                    log::error!("Failed to write videos sitemap XML: {e}");
                    HttpResponse::InternalServerError().finish()
                }
            }
        }
        Err(e) => {
            log::error!("Failed to build videos sitemap: {e}");
            HttpResponse::InternalServerError().finish()
        }
    }
}

// ── Galleries sub-sitemap ────────────────────────────────────────────────────

pub async fn galleries(state: web::Data<AppState>) -> HttpResponse {
    let base = state.site_url.trim_end_matches('/');

    let items = match ContentItems::find()
        .filter(content_items::Column::Type.eq(ContentType::ImageSet))
        .filter(content_items::Column::Status.eq(ContentStatus::Ready))
        .filter(content_items::Column::Visibility.eq(ContentVisibility::Public))
        .order_by_desc(content_items::Column::CreatedAt)
        .all(&state.conn)
        .await
    {
        Ok(items) => items,
        Err(e) => {
            log::error!("DB error fetching galleries for sitemap: {e}");
            return HttpResponse::InternalServerError().finish();
        }
    };

    let urls: Vec<Url> = items
        .into_iter()
        .filter_map(|c| {
            let slug = c.slug?;
            let loc = format!("{base}/g/{slug}");
            Some(make_url(loc, 0.9, ChangeFrequency::Weekly, Some(c.updated_at)))
        })
        .collect();

    match UrlSet::new(urls) {
        Ok(set) => {
            let mut buf = Vec::new();
            match set.write(&mut buf) {
                Ok(()) => xml_response(buf),
                Err(e) => {
                    log::error!("Failed to write galleries sitemap XML: {e}");
                    HttpResponse::InternalServerError().finish()
                }
            }
        }
        Err(e) => {
            log::error!("Failed to build galleries sitemap: {e}");
            HttpResponse::InternalServerError().finish()
        }
    }
}

// ── User profiles sub-sitemap ────────────────────────────────────────────────

pub async fn profiles(state: web::Data<AppState>) -> HttpResponse {
    let base = state.site_url.trim_end_matches('/');

    let user_ids: Vec<Uuid> = match ContentItems::find()
        .select_only()
        .column(content_items::Column::UploaderId)
        .distinct()
        .filter(content_items::Column::Status.eq(ContentStatus::Ready))
        .filter(content_items::Column::Visibility.eq(ContentVisibility::Public))
        .into_tuple::<Uuid>()
        .all(&state.conn)
        .await
    {
        Ok(ids) => ids,
        Err(e) => {
            log::error!("DB error fetching content uploader IDs for sitemap: {e}");
            return HttpResponse::InternalServerError().finish();
        }
    };

    if user_ids.is_empty() {
        match UrlSet::new(Vec::new()) {
            Ok(set) => {
                let mut buf = Vec::new();
                match set.write(&mut buf) {
                    Ok(()) => xml_response(buf),
                    Err(e) => {
                        log::error!("Failed to write profiles sitemap XML: {e}");
                        HttpResponse::InternalServerError().finish()
                    }
                }
            }
            Err(e) => {
                log::error!("Failed to build profiles sitemap: {e}");
                HttpResponse::InternalServerError().finish()
            }
        }
    } else {
        let items = match Users::find()
            .filter(users::Column::Id.is_in(user_ids))
            .order_by_desc(users::Column::UpdatedAt)
            .all(&state.conn)
            .await
        {
            Ok(items) => items,
            Err(e) => {
                log::error!("DB error fetching users for sitemap: {e}");
                return HttpResponse::InternalServerError().finish();
            }
        };

        let urls: Vec<Url> = items
            .into_iter()
            .map(|u| {
                let loc = format!("{base}/@{}", u.username);
                make_url(loc, 0.7, ChangeFrequency::Weekly, Some(u.updated_at))
            })
            .collect();

        match UrlSet::new(urls) {
            Ok(set) => {
                let mut buf = Vec::new();
                match set.write(&mut buf) {
                    Ok(()) => xml_response(buf),
                    Err(e) => {
                        log::error!("Failed to write profiles sitemap XML: {e}");
                        HttpResponse::InternalServerError().finish()
                    }
                }
            }
            Err(e) => {
                log::error!("Failed to build profiles sitemap: {e}");
                HttpResponse::InternalServerError().finish()
            }
        }
    }
}
