use actix_web::{Responder, Result, web};
use askama::Template;

#[derive(Template)]
#[template(path = "index.html")]
struct HomePage;

#[derive(Template)]
#[template(path = "profile.html")]
struct ProfilePage;

pub async fn index() -> Result<impl Responder> {
    let html = HomePage.render().expect("index.html should be valid");
    Ok(web::Html::new(html))
}

pub async fn profile() -> Result<impl Responder> {
    let html = ProfilePage.render().expect("profile.html should be valid");
    Ok(web::Html::new(html))
}
