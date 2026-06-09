use actix_session::Session;
use actix_web::{Responder, Result, web};
use askama::Template;

use crate::auth;
use crate::AppState;

#[derive(Template)]
#[template(path = "video.html")]
struct VideoPage {
    logged_in: bool,
}

pub async fn video(session: Session, state: web::Data<AppState>) -> Result<impl Responder> {
    let logged_in = auth::get_session_user(&session, &state.conn).await.is_some();
    let html = VideoPage { logged_in }.render().expect("video.html should be valid");
    Ok(web::Html::new(html))
}
