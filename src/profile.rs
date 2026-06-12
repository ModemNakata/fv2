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
    logged_in: bool,
}

pub async fn user_profile(
    session: Session,
    state: web::Data<AppState>,
    username: web::Path<String>,
) -> HttpResponse {
    let logged_in = auth::get_session_user(&session, &state.conn)
        .await
        .is_some();

    let username = username.into_inner();

    match users::Entity::find()
        .filter(users::Column::Username.eq(&username))
        .one(&state.conn)
        .await
    {
        Ok(Some(_user)) => {
            let html = UserProfilePage { logged_in }
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
