use actix_session::Session;
use actix_web::{HttpRequest, Responder, Result, web};
use askama::Template;

use crate::auth;
use crate::AppState;

#[derive(Template)]
#[template(path = "footer_page.html")]
struct FooterPage {
    username: String,
    logged_in: bool,
    session_avatar_url: Option<String>,
    version: String,
    slug: String,
}

pub async fn page(req: HttpRequest, session: Session, state: web::Data<AppState>) -> Result<impl Responder> {
    let slug = req.path().trim_start_matches('/').to_string();

    let session_user = auth::get_session_user(&session, &state.conn).await;
    let html = FooterPage {
        username: session_user.as_ref().map(|u| u.username.clone()).unwrap_or_default(),
        logged_in: session_user.is_some(),
        session_avatar_url: session_user.and_then(|u| u.avatar_url),
        version: state.static_version.clone(),
        slug,
    }
    .render()
    .expect("footer_page.html should be valid");
    Ok(web::Html::new(html))
}
