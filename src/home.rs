use actix_web::{Responder, Result, web};
use askama::Template;

#[derive(Template)]
#[template(path = "index.html")]
struct HomePage {
    logged_in: bool,
}

#[derive(Template)]
#[template(path = "profile.html")]
struct ProfilePage {
    logged_in: bool,
}

pub async fn index() -> Result<impl Responder> {
    let html = HomePage { logged_in: false }.render().expect("index.html should be valid");
    Ok(web::Html::new(html))
}

pub async fn profile() -> Result<impl Responder> {
    let html = ProfilePage { logged_in: true }.render().expect("profile.html should be valid");
    Ok(web::Html::new(html))
}
