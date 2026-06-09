use actix_session::Session;
use actix_web::{Responder, Result, web};
use askama::Template;

use crate::auth;
use crate::AppState;

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

pub async fn index(session: Session, state: web::Data<AppState>) -> Result<impl Responder> {
    let logged_in = auth::get_session_user(&session, &state.conn).await.is_some();
    let html = HomePage { logged_in }.render().expect("index.html should be valid");
    Ok(web::Html::new(html))
}

pub async fn profile(session: Session, state: web::Data<AppState>) -> Result<impl Responder> {
    let logged_in = auth::get_session_user(&session, &state.conn).await.is_some();
    let html = ProfilePage { logged_in }.render().expect("profile.html should be valid");
    Ok(web::Html::new(html))
}
