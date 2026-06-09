use actix_web::{Responder, Result, web};
use askama::Template;

#[derive(Template)]
#[template(path = "index.html")]
struct HomePage;

pub async fn index() -> Result<impl Responder> {
    let html = HomePage.render().expect("index.html should be valid");

    Ok(web::Html::new(html))
}
