use actix_session::Session;
use actix_web::{Responder, Result, web};
use askama::Template;

use crate::auth;
use crate::AppState;

#[derive(Template)]
#[template(path = "video.html")]
struct VideoPage {
    logged_in: bool,
    video_title: String,
    source_url: String,
}

pub async fn video(session: Session, state: web::Data<AppState>) -> Result<impl Responder> {
    let logged_in = auth::get_session_user(&session, &state.conn).await.is_some();
    let html = VideoPage {
        logged_in,
        video_title: "FeVid.Cloud".to_string(),
        source_url: "/static/test.mp4".to_string(),
    }
    .render()
    .expect("video.html should be valid");
    Ok(web::Html::new(html))
}
