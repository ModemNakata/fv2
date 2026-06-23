use serde::{Deserialize, Serialize};
use std::env;

/// Cryptowrap API client configuration.
#[derive(Clone, Debug)]
pub struct CryptowrapConfig {
    pub base_url: String,
    pub api_token: String,
    pub notify_url: String,
}

impl CryptowrapConfig {
    pub fn from_env() -> Self {
        Self {
            base_url: env::var("CRYPTOWRAP_BASE_URL")
                .expect("CRYPTOWRAP_BASE_URL is not set in .env file"),
            api_token: env::var("CRYPTOWRAP_API_TOKEN")
                .expect("CRYPTOWRAP_API_TOKEN is not set in .env file"),
            notify_url: env::var("CRYPTOWRAP_NOTIFY_URL")
                .expect("CRYPTOWRAP_NOTIFY_URL is not set in .env file"),
        }
    }
}

// ── Request/Response types ───────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct CreateInvoiceRequest {
    pub currency: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fiat_amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fiat_currency: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notify_url: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct CreateInvoiceResponse {
    pub invoice_uuid: String,
    pub wallet_address: String,
    pub amount_requested: String,
    pub currency: String,
    pub iframe_url: String,
}

#[derive(Serialize, Deserialize)]
pub struct CheckInvoiceResponse {
    pub invoice_uuid: String,
    pub wallet_address: String,
    pub amount_requested: String,
    pub amount_received: String,
    pub currency: String,
    pub payment_status: String,
    pub is_finalized: bool,
}

// ── Status thresholds ─────────────────────────────────────────────────────────

/// Minimum payment status to consider a purchase successful.
/// Statuses are ordered: waiting < detected < confirmed < expired.
/// Setting to "detected" means the purchase completes as soon as
/// the blockchain transaction is first seen (0 confirmations).
pub const MIN_SUCCESS_STATUS: &str = "detected";

/// Returns true if the given cryptowrap payment_status meets or exceeds
/// the minimum success threshold.
pub fn is_payment_successful(status: &str) -> bool {
    let threshold = match MIN_SUCCESS_STATUS {
        "detected" => 1,
        "confirmed" => 2,
        _ => 2, // default to confirmed
    };
    let current = match status {
        "waiting" => 0,
        "detected" => 1,
        "confirmed" => 2,
        _ => 0,
    };
    current >= threshold
}

// ── API client ───────────────────────────────────────────────────────────────

/// Build a reqwest Client that skips TLS verification (for cryptowrap's self-signed certs).
fn build_client() -> reqwest::Client {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .expect("Failed to build reqwest client with unsafe TLS")
}

/// Create a new invoice for a given fiat amount and cryptocurrency.
pub async fn create_invoice(
    config: &CryptowrapConfig,
    currency: &str,
    fiat_amount: &str,
) -> Result<CreateInvoiceResponse, String> {
    let url = format!("{}/api/v1/payment/create_invoice", config.base_url);

    let body = CreateInvoiceRequest {
        currency: currency.to_string(),
        fiat_amount: Some(fiat_amount.to_string()),
        fiat_currency: Some("usd".to_string()),
        notify_url: Some(config.notify_url.clone()),
    };

    let client = build_client();
    let resp = client
        .post(&url)
        // .header("Authorization", format!("Bearer {}", config.api_token))
        .header("X-API-Key", format!("{}", config.api_token))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to call cryptowrap create_invoice: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!(
            "cryptowrap create_invoice returned {status}: {text}"
        ));
    }

    resp.json::<CreateInvoiceResponse>()
        .await
        .map_err(|e| format!("Failed to parse cryptowrap create_invoice response: {e}"))
}

/// Check the status of an invoice.
pub async fn check_invoice(
    config: &CryptowrapConfig,
    invoice_uuid: &str,
) -> Result<CheckInvoiceResponse, String> {
    let url = format!(
        "{}/api/v1/payment/check_invoice?invoice_uuid={}",
        config.base_url, invoice_uuid
    );

    let client = build_client();
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", config.api_token))
        .send()
        .await
        .map_err(|e| format!("Failed to call cryptowrap check_invoice: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!(
            "cryptowrap check_invoice returned {status}: {text}"
        ));
    }

    resp.json::<CheckInvoiceResponse>()
        .await
        .map_err(|e| format!("Failed to parse cryptowrap check_invoice response: {e}"))
}
