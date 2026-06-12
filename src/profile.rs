use actix_session::Session;
use actix_web::{HttpResponse, web};
use askama::Template;
use sea_orm::*;

use crate::AppState;
use crate::auth;
use crate::entity::users;

#[derive(Template)]
#[template(path = "profile.html")]
struct UserProfilePage {
    username: Option<String>,
    logged_in: bool,
    is_owner: bool,
}

pub async fn user_profile(
    session: Session,
    state: web::Data<AppState>,
    username: web::Path<String>,
) -> HttpResponse {
    let session_user = auth::get_session_user(&session, &state.conn).await;
    let logged_in = session_user.is_some();

    let profile_username = username.into_inner();
    let is_owner = session_user.as_deref() == Some(&profile_username);

    match users::Entity::find()
        .filter(users::Column::Username.eq(&profile_username))
        .one(&state.conn)
        .await
    {
        Ok(Some(_user)) => {
            let html = UserProfilePage { username: session_user, logged_in, is_owner }
                .render()
                .expect("profile.html should be valid");
            HttpResponse::Ok().body(html)
        }
        Ok(None) => HttpResponse::NotFound().body("User not found"),
        Err(e) => {
            log::error!("DB error fetching user: {e}");
            HttpResponse::InternalServerError().body("Database error")
        }
    }
}
