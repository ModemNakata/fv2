use actix_session::Session;
use actix_web::{HttpResponse, web};
use askama::Template;

use crate::auth;
use crate::AppState;

#[derive(Template)]
#[template(path = "balance.html")]
struct BalancePage {
    username: String,
    logged_in: bool,
    balance: String,
    lifetime_earnings: String,
    pending_payout: String,
    version: String,
}

pub async fn balance_page(session: Session, state: web::Data<AppState>) -> HttpResponse {
    let session_user = auth::get_session_user(&session, &state.conn).await;
    let logged_in = session_user.is_some();

    let user = match auth::require_user(&session, &state.conn).await {
        Ok(u) => u,
        Err(resp) => return resp,
    };

    // TODO: wire up real balance data when payment system is implemented
    let html = BalancePage {
        username: user.username,
        logged_in,
        balance: "$0.00".to_string(),
        lifetime_earnings: "$0.00".to_string(),
        pending_payout: "$0.00".to_string(),
        version: state.static_version.clone(),
    }
    .render()
    .expect("balance.html should be valid");

    HttpResponse::Ok().body(html)
}
