use ::s3::Bucket;
use crate::s3::S3UrlProvider;
use actix_session::SessionMiddleware;
use actix_session::config::PersistentSession;
use actix_session::storage::CookieSessionStore;
use actix_web::cookie::Key;
use actix_web::{App, HttpServer, middleware, web};
use sea_orm::{ConnectOptions, Database, DatabaseConnection};
use std::env;
use tracing_subscriber::fmt;

mod auth;
mod balance;
mod components;
mod content_edit;
mod cryptowrap;
mod currency;
mod entity;
mod favorites;
mod favourite;
mod gallery;
mod home;
mod notifications;
mod pages;
mod payments;
mod pipeline;
mod profile;
mod purchase;
mod purchases;
mod s3;
mod settings;
mod sitemap;
mod upload_direct;
mod video;
mod view_counter;

#[derive(Clone)]
pub struct AppState {
    pub conn: DatabaseConnection,
    pub s3_processed: Bucket,
    pub s3_orig: Bucket,
    pub s3: S3UrlProvider,
    pub static_version: String,
    pub redis_conn: redis::aio::ConnectionManager,
    pub cryptowrap: cryptowrap::CryptowrapConfig,
    pub max_upload_size_video: u64,
    pub max_upload_size_gallery: u64,
    pub max_upload_images_count: u32,
    pub site_url: String,
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Hardcode the environment variable right at the start (quick and dirty) ... (doesn't work)
    // unsafe {
    //     env::set_var("RUST_LOG", "info,sqlx=warn,sea_orm=warn");
    // }

    fmt::fmt().init();

    log::info!("starting HTTP server");

    dotenvy::dotenv().ok();
    let db_url = env::var("DATABASE_URL").expect("DATABASE_URL is not set in .env file");
    let key = match env::var("SESSION_SECRET") {
        Ok(hex_key) => {
            let bytes =
                hex::decode(hex_key.trim()).expect("SESSION_SECRET must be a valid hex string");
            Key::from(&bytes)
        }
        Err(_) => {
            log::warn!(
                "SESSION_SECRET not set, using ephemeral key (sessions will invalidate on restart)"
            );
            Key::generate()
        }
    };

    let mut opt = ConnectOptions::new(db_url);
    opt
        // .max_connections(100)
        // .min_connections(5)
        // .connect_timeout(Duration::from_secs(8))
        // .acquire_timeout(Duration::from_secs(8))
        // .idle_timeout(Duration::from_secs(8))
        // .max_lifetime(Duration::from_secs(8))
        .sqlx_logging(false); // <-- This completely disables sqlx logging
    // .sqlx_logging_level(log::LevelFilter::Debug); // Or change it to Debug/Trace so it's less verbose

    // let conn = Database::connect(&db_url).await.unwrap();
    let conn = Database::connect(opt).await.unwrap();
    let (s3_processed, s3_orig) = s3::init_buckets();
    let s3 = S3UrlProvider::new(s3_processed.clone());

    // ── View counter: Redis connection ──────────────────────────────────────
    let redis_client = redis::Client::open(view_counter::redis_url()).expect("invalid REDIS_URL");
    let redis_conn = redis::aio::ConnectionManager::new(redis_client)
        .await
        .expect("failed to connect to Redis");

    let static_version = env!("CARGO_PKG_VERSION").to_string();
    let cryptowrap = cryptowrap::CryptowrapConfig::from_env();
    let max_upload_size_video: u64 = env::var("MAX_UPLOAD_SIZE_VIDEO")
        .unwrap_or_else(|_| "10737418240".to_string())
        .parse()
        .expect("MAX_UPLOAD_SIZE_VIDEO must be a valid u64");
    let max_upload_size_gallery: u64 = env::var("MAX_UPLOAD_SIZE_GALLERY")
        .unwrap_or_else(|_| "5368709120".to_string())
        .parse()
        .expect("MAX_UPLOAD_SIZE_GALLERY must be a valid u64");
    let max_upload_images_count: u32 = env::var("MAX_UPLOAD_IMAGES_COUNT")
        .unwrap_or_else(|_| "100".to_string())
        .parse()
        .expect("MAX_UPLOAD_IMAGES_COUNT must be a valid u32");
    let site_url = env::var("SITE_URL").unwrap_or_else(|_| "https://fevid.cloud".to_string());
    let state = AppState {
        conn,
        s3_processed,
        s3_orig,
        s3,
        static_version,
        redis_conn,
        cryptowrap,
        max_upload_size_video,
        max_upload_size_gallery,
        max_upload_images_count,
        site_url,
    };

    // ── Background worker: flush view counters to Postgres every 5 min ──────
    let worker_state = state.clone();
    actix_web::rt::spawn(async move {
        view_counter::sync_views_to_db(worker_state).await;
    });

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(state.clone()))
            .wrap(
                SessionMiddleware::builder(CookieSessionStore::default(), key.clone())
                    .cookie_name("fevid-session".to_owned())
                    .cookie_secure(true)
                    .session_lifecycle(
                        PersistentSession::default()
                            .session_ttl(actix_web::cookie::time::Duration::days(365)),
                    )
                    .build(),
            )
            .wrap(middleware::Logger::default())
            .service(web::resource("/").route(web::get().to(home::index)))
            .service(
                web::resource("/upload/video")
                    .route(web::get().to(home::upload_video)),
            )
            .service(
                web::resource("/upload/gallery")
                    .route(web::get().to(home::upload_gallery)),
            )
            .service(web::resource("/video").route(web::get().to(video::redirect_to_home)))
            .service(web::resource("/video/{uuid}").route(web::get().to(video::video)))
            .service(web::resource("/gallery").route(web::get().to(gallery::index)))
            .service(web::resource("/gallery/{uuid}").route(web::get().to(gallery::gallery)))
            .service(web::resource("/privacy").route(web::get().to(pages::page)))
            .service(web::resource("/terms").route(web::get().to(pages::page)))
            .service(web::resource("/contact").route(web::get().to(pages::page)))
            .service(web::resource("/dmca").route(web::get().to(pages::page)))
            .service(web::resource("/aup").route(web::get().to(pages::page)))
            .service(web::resource("/refund").route(web::get().to(pages::page)))
            .service(web::resource("/compliance").route(web::get().to(pages::page)))
            .service(
                web::resource("/sitemap.xml").route(web::get().to(sitemap::index)),
            )
            .service(
                web::resource("/sitemap-static.xml")
                    .route(web::get().to(sitemap::static_pages)),
            )
            .service(
                web::resource("/sitemap-videos.xml")
                    .route(web::get().to(sitemap::videos)),
            )
            .service(
                web::resource("/sitemap-galleries.xml")
                    .route(web::get().to(sitemap::galleries)),
            )
            .service(
                web::resource("/sitemap-profiles.xml")
                    .route(web::get().to(sitemap::profiles)),
            )
            .service(web::resource("/@{username}").route(web::get().to(profile::user_profile)))
            .service(
                web::resource("/settings")
                    .route(web::get().to(settings::settings_page))
                    .route(web::post().to(settings::update_settings)),
            )
            .service(
                web::resource("/edit/{uuid}")
                    .route(web::get().to(content_edit::edit_page)),
            )
            .service(web::resource("/balance").route(web::get().to(balance::balance_page)))
            .service(web::resource("/notifications").route(web::get().to(notifications::notifications_page)))
            .service(web::resource("/favorites").route(web::get().to(favorites::favorites)))
            .service(web::resource("/purchased").route(web::get().to(purchases::purchased)))
            .service(
                web::scope("/auth")
                    .service(auth::auth_check)
                    .service(auth::sign_up)
                    .service(auth::sign_in)
                    .service(auth::sign_out)
                    .service(auth::instant_register)
                    .service(auth::set_or_change_password),
            )
            .service(
                web::scope("/api")
                    .route(
                        "/pending-processing",
                        web::get().to(pipeline::pending_processing),
                    )
                    .route("/content/{id}", web::get().to(pipeline::get_content))
                    .route(
                        "/content/{id}/status",
                        web::patch().to(pipeline::update_status),
                    )
                    .route(
                        "/profile/{username}/videos",
                        web::get().to(profile::api_videos),
                    )
                    .route(
                        "/profile/{username}/galleries",
                        web::get().to(profile::api_galleries),
                    )
                    .route(
                        "/profile/{username}/followers",
                        web::get().to(profile::api_followers),
                    )
                    .route(
                        "/profile/{username}/following",
                        web::get().to(profile::api_following),
                    )
                    .route(
                        "/content/{id}/cancel",
                        web::post().to(pipeline::cancel_content),
                    )
                    .route(
                        "/content/{id}/edit",
                        web::patch().to(content_edit::update_content),
                    )
                    .route(
                        "/content/{id}/favourite",
                        web::post().to(favourite::toggle_favourite),
                    )
                    .route("/favorites", web::get().to(favorites::api_favorites))
                    .route("/purchased", web::get().to(purchases::api_purchased))
                    .route(
                        "/content/{id}/purchase",
                        web::post().to(purchase::purchase_content),
                    )
                    .route(
                        "/content/{id}/purchase/crypto",
                        web::post().to(payments::create_crypto_invoice),
                    )
                    .route(
                        "/payments/{invoice_uuid}/status",
                        web::get().to(payments::check_payment_status),
                    )
                    .route(
                        "/webhooks/cryptowrap",
                        web::post().to(payments::cryptowrap_webhook),
                    )
                    // ── View counter ────────────────────────────────────────
                    .route(
                        "/content/{uuid}/view",
                        web::post().to(view_counter::track_view),
                    )
                    .route(
                        "/profile/{uuid}/view",
                        web::post().to(view_counter::track_profile_view),
                    )
                    // ── Notifications ────────────────────────────────────────
                    .route(
                        "/notifications",
                        web::get().to(notifications::api_notifications),
                    )
                    .route(
                        "/notifications/unread",
                        web::get().to(notifications::api_unread_count),
                    )
                    .route(
                        "/notifications/recent",
                        web::get().to(notifications::api_recent),
                    )
                    .route(
                        "/notifications/{id}/read",
                        web::post().to(notifications::api_mark_read),
                    )
                    .route(
                        "/notifications/read-all",
                        web::post().to(notifications::api_mark_all_read),
                    )
                    // ── Direct S3 upload ─────────────────────────────────────
                    .route(
                        "/upload/video/init",
                        web::post().to(upload_direct::init_video_upload),
                    )
                    .route(
                        "/upload/gallery/init",
                        web::post().to(upload_direct::init_gallery_upload),
                    )
                    .route(
                        "/upload/{id}/complete",
                        web::post().to(upload_direct::complete_upload),
                    )
                    .route(
                        "/gallery/{uuid}/images",
                        web::get().to(gallery::api_gallery_images),
                    ),
            )
    })
    .bind(("0.0.0.0", 10903))?
    .run()
    .await
}
