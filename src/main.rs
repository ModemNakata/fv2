use actix_web::{App, HttpServer, Responder, Result, middleware, web};
use askama::Template;

#[derive(Template)]
#[template(path = "index.html")]
struct HomePage;

async fn index() -> Result<impl Responder> {
    let html = HomePage.render().expect("index.html should be valid");

    Ok(web::Html::new(html))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));

    log::info!("starting HTTP server");

    HttpServer::new(move || {
        App::new()
            .wrap(middleware::Logger::default())
            .service(web::resource("/").route(web::get().to(index)))
    })
    .bind(("127.0.0.1", 8080))?
    .run()
    .await
}
