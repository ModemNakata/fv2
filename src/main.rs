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
mod currency;
mod entity;
mod favorites;
mod favourite;
mod gallery;
mod home;
mod notifications;
mod pipeline;
mod profile;
mod purchase;
mod purchases;
mod s3;
mod settings;
mod upload;
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
    let state = AppState {
        conn,
        s3_processed,
        s3_orig,
        s3,
        static_version,
        redis_conn,
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
                    .route(web::get().to(home::upload_video))
                    .route(web::post().to(upload::upload_video)),
            )
            .service(
                web::resource("/upload/gallery")
                    .route(web::get().to(home::upload_gallery))
                    .route(web::post().to(upload::upload_gallery)),
            )
            .service(web::resource("/video").route(web::get().to(video::redirect_to_home)))
            .service(web::resource("/video/{uuid}").route(web::get().to(video::video)))
            .service(web::resource("/gallery").route(web::get().to(gallery::index)))
            .service(web::resource("/gallery/{uuid}").route(web::get().to(gallery::gallery)))
            .service(web::resource("/@{username}").route(web::get().to(profile::user_profile)))
            .service(
                web::resource("/settings")
                    .route(web::get().to(settings::settings_page))
                    .route(web::post().to(settings::update_settings)),
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
                        "/content/{id}/favourite",
                        web::post().to(favourite::toggle_favourite),
                    )
                    .route("/favorites", web::get().to(favorites::api_favorites))
                    .route("/purchased", web::get().to(purchases::api_purchased))
                    .route(
                        "/content/{id}/purchase",
                        web::post().to(purchase::purchase_content),
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
                    ),
            )
    })
    .bind(("0.0.0.0", 10903))?
    .run()
    .await
}
