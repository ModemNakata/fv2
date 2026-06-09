use actix_web::{App, HttpServer, Responder, Result, middleware, web};
use askama::Template;
use sea_orm::{Database, DatabaseConnection};
use std::env;
// use tracing_subscriber::{EnvFilter, fmt};
use tracing_subscriber::fmt;

#[derive(Template)]
#[template(path = "index.html")]
struct HomePage;

async fn index() -> Result<impl Responder> {
    let html = HomePage.render().expect("index.html should be valid");

    Ok(web::Html::new(html))
}

#[derive(Debug, Clone)]
struct AppState {
    conn: DatabaseConnection,
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // unsafe {
    //     std::env::set_var("RUST_LOG", "debug");
    // }

    // let env_filter = EnvFilter::try_from_default_env()
    // .unwrap_or_else(|_| EnvFilter::new("info"));

    // fmt::fmt().with_env_filter(env_filter).init();
    fmt::fmt().init();

    log::info!("starting HTTP server");

    // get env vars
    dotenvy::dotenv().ok();
    let db_url = env::var("DATABASE_URL").expect("DATABASE_URL is not set in .env file");

    let conn = Database::connect(&db_url).await.unwrap();
    // migrator

    let state = AppState { conn };

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(state.clone()))
            .wrap(middleware::Logger::default()) // TracingLogger::default() -> from tracing-actix-web | duration_ms=?
            // .wrap(TracingLogger::default())
            .service(web::resource("/").route(web::get().to(index)))
    })
    .bind(("0.0.0.0", 8080))?
    .run()
    .await
}
