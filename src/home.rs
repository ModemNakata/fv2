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

#[derive(Template)]
#[template(path = "upload-video.html")]
struct UploadVideoPage {
    logged_in: bool,
}

#[derive(Template)]
#[template(path = "upload-gallery.html")]
struct UploadGalleryPage {
    logged_in: bool,
}

pub async fn profile(session: Session, state: web::Data<AppState>) -> Result<impl Responder> {
    let logged_in = auth::get_session_user(&session, &state.conn).await.is_some();
    let html = ProfilePage { logged_in }.render().expect("profile.html should be valid");
    Ok(web::Html::new(html))
}

pub async fn upload_video(session: Session, state: web::Data<AppState>) -> Result<impl Responder> {
    let logged_in = auth::get_session_user(&session, &state.conn).await.is_some();
    let html = UploadVideoPage { logged_in }.render().expect("upload-video.html should be valid");
    Ok(web::Html::new(html))
}

pub async fn upload_gallery(session: Session, state: web::Data<AppState>) -> Result<impl Responder> {
    let logged_in = auth::get_session_user(&session, &state.conn).await.is_some();
    let html = UploadGalleryPage { logged_in }.render().expect("upload-gallery.html should be valid");
    Ok(web::Html::new(html))
}
