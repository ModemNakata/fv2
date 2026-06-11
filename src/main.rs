use actix_session::config::PersistentSession;
use actix_session::storage::CookieSessionStore;
use actix_session::SessionMiddleware;
use actix_web::cookie::Key;
use actix_web::{App, HttpServer, middleware, web};
use ::s3::Bucket;
use sea_orm::{Database, DatabaseConnection};
use std::env;
use tracing_subscriber::fmt;

mod auth;
mod entity;
mod gallery;
mod home;
mod pipeline;
mod s3;
mod upload;
mod video;

#[derive(Clone)]
pub struct AppState {
    pub conn: DatabaseConnection,
    pub s3_processed: Bucket,
    pub s3_orig: Bucket,
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    fmt::fmt().init();

    log::info!("starting HTTP server");

    dotenvy::dotenv().ok();
    let db_url = env::var("DATABASE_URL").expect("DATABASE_URL is not set in .env file");
    let key = match env::var("SESSION_SECRET") {
        Ok(hex_key) => {
            let bytes = hex::decode(hex_key.trim())
                .expect("SESSION_SECRET must be a valid hex string");
            Key::from(&bytes)
        }
        Err(_) => {
            log::warn!("SESSION_SECRET not set, using ephemeral key (sessions will invalidate on restart)");
            Key::generate()
        }
    };

    let conn = Database::connect(&db_url).await.unwrap();
    let (s3_processed, s3_orig) = s3::init_buckets();

    let state = AppState { conn, s3_processed, s3_orig };

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(state.clone()))
            .wrap(
                SessionMiddleware::builder(CookieSessionStore::default(), key.clone())
                    .cookie_name("fevid-session".to_owned())
                    .cookie_secure(true)
                    .session_lifecycle(
                        PersistentSession::default().session_ttl(actix_web::cookie::time::Duration::days(365)),
                    )
                    .build(),
            )
            .wrap(middleware::Logger::default())
            .service(web::resource("/").route(web::get().to(home::index)))
            .service(web::resource("/profile").route(web::get().to(home::profile)))
            .service(web::resource("/upload/video")
                .route(web::get().to(home::upload_video))
                .route(web::post().to(upload::upload_video))
            )
            .service(web::resource("/upload/gallery")
                .route(web::get().to(home::upload_gallery))
                .route(web::post().to(upload::upload_gallery))
            )
            .service(web::resource("/video").route(web::get().to(video::video)))
            .service(web::resource("/gallery").route(web::get().to(gallery::gallery)))
            .service(
                web::scope("/auth")
                    .service(auth::auth_check)
                    .service(auth::sign_up)
                    .service(auth::sign_in)
                    .service(auth::sign_out),
            )
            .service(
                web::scope("/api")
                    .route("/pending-processing", web::get().to(pipeline::pending_processing))
                    .route("/content/{id}/status", web::patch().to(pipeline::update_status)),
            )
    })
    .bind(("0.0.0.0", 8080))?
    .run()
    .await
}
