use actix_session::storage::CookieSessionStore;
use actix_session::SessionMiddleware;
use actix_web::cookie::Key;
use actix_web::{App, HttpServer, middleware, web};
use sea_orm::{Database, DatabaseConnection};
use std::env;
use tracing_subscriber::fmt;

mod auth;
mod entity;
mod home;

#[derive(Debug, Clone)]
pub struct AppState {
    pub conn: DatabaseConnection,
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    fmt::fmt().init();

    log::info!("starting HTTP server");

    dotenvy::dotenv().ok();
    let db_url = env::var("DATABASE_URL").expect("DATABASE_URL is not set in .env file");
    let secret = env::var("SESSION_SECRET")
        .unwrap_or_else(|_| "0000000000000000000000000000000000000000000000000000000000000000".to_string());
    let key = Key::from(secret.as_bytes());

    let conn = Database::connect(&db_url).await.unwrap();

    let state = AppState { conn };

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(state.clone()))
            .wrap(SessionMiddleware::new(CookieSessionStore::default(), key.clone()))
            .wrap(middleware::Logger::default())
            .service(web::resource("/").route(web::get().to(home::index)))
            .service(web::resource("/profile").route(web::get().to(home::profile)))
            .service(
                web::scope("/auth")
                    .service(auth::auth_check)
                    .service(auth::sign_up)
                    .service(auth::sign_in)
                    .service(auth::sign_out),
            )
    })
    .bind(("0.0.0.0", 8080))?
    .run()
    .await
}
