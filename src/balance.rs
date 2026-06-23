use actix_session::Session;
use actix_web::{HttpResponse, web};
use askama::Template;
use sea_orm::*;

use crate::auth;
use crate::currency;
use crate::entity::prelude::*;
use crate::entity::sea_orm_active_enums::TransactionStatus;
use crate::entity::transactions;
use crate::AppState;

const PLATFORM_FEE_PCT: f64 = 0.13;

#[derive(Template)]
#[template(path = "balance.html")]
struct BalancePage {
    username: String,
    logged_in: bool,
    session_avatar_url: Option<String>,
    balance: String,
    lifetime_earnings: String,
    pending_payout: String,
    version: String,
    currencies: Vec<CurrencyItem>,
}

struct CurrencyItem {
    name: &'static str,
    ticker: &'static str,
    icon_path: &'static str,
}

fn cents_to_dollars(cents: i64) -> String {
    let dollars = cents as f64 / 100.0;
    format!("${:.2}", dollars)
}

fn calc_net(cents: i64) -> i64 {
    (cents as f64 * (1.0 - PLATFORM_FEE_PCT)).round() as i64
}

pub async fn balance_page(session: Session, state: web::Data<AppState>) -> HttpResponse {
    let session_user = auth::get_session_user(&session, &state.conn).await;
    let logged_in = session_user.is_some();

    let user = match auth::require_user(&session, &state.conn).await {
        Ok(u) => u,
        Err(resp) => return resp,
    };

    let all_tx = Transactions::find()
        .filter(transactions::Column::SellerId.eq(user.id))
        .all(&state.conn)
        .await
        .unwrap_or_default();

    let completed_cents: i64 = all_tx
        .iter()
        .filter(|t| t.status == TransactionStatus::Completed)
        .map(|t| t.amount_cents as i64)
        .sum();

    let pending_cents: i64 = all_tx
        .iter()
        .filter(|t| t.status == TransactionStatus::Pending)
        .map(|t| t.amount_cents as i64)
        .sum();

    let available_cents = calc_net(completed_cents);
    let pending_net = calc_net(pending_cents);

    let currencies: Vec<CurrencyItem> = currency::SUPPORTED_CURRENCIES
        .iter()
        .map(|c| CurrencyItem {
            name: c.name,
            ticker: c.ticker,
            icon_path: c.icon_path,
        })
        .collect();

    let html = BalancePage {
        username: user.username,
        logged_in,
        session_avatar_url: user.avatar_url,
        balance: cents_to_dollars(available_cents),
        lifetime_earnings: cents_to_dollars(completed_cents),
        pending_payout: cents_to_dollars(pending_net),
        version: state.static_version.clone(),
        currencies,
    }
    .render()
    .expect("balance.html should be valid");

    HttpResponse::Ok().body(html)
}
