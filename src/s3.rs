use s3::Bucket;
use s3::creds::Credentials;
use s3::region::Region;
use std::env;

fn build_bucket(bucket_name: &str) -> Bucket {
    let endpoint = env::var("S3_ENDPOINT").expect("S3_ENDPOINT is not set in .env");
    let access_key = env::var("S3_ACCESS_KEY").expect("S3_ACCESS_KEY is not set in .env");
    let secret_key = env::var("S3_SECRET_KEY").expect("S3_SECRET_KEY is not set in .env");
    let region_str = env::var("S3_REGION").unwrap_or_else(|_| "us-east-1".to_string());

    let credentials = Credentials::new(Some(&access_key), Some(&secret_key), None, None, None)
        .expect("failed to create S3 credentials");

    let region = Region::Custom {
        region: region_str,
        endpoint,
    };

    *Bucket::new(bucket_name, region, credentials)
        .expect("failed to create S3 bucket")
        .with_path_style()
}

pub fn init_buckets() -> (Bucket, Bucket) {
    let bucket = env::var("S3_BUCKET").expect("S3_BUCKET is not set in .env");
    let bucket_orig = env::var("S3_BUCKET_ORIGIN").expect("S3_BUCKET_ORIGIN is not set in .env");
    (build_bucket(&bucket), build_bucket(&bucket_orig))
}

/// Generates presigned S3 URLs for serving private content to users.
/// The processed bucket is private by default, so all URLs are presigned.
#[derive(Clone)]
pub struct S3UrlProvider {
    processed_bucket: Bucket,
    default_expiry_secs: u32,
}

impl S3UrlProvider {
    pub fn new(processed_bucket: Bucket) -> Self {
        Self {
            processed_bucket,
            default_expiry_secs: 86400, // 24 hours
        }
    }

    /// Generate a presigned GET URL with the default expiry (24h).
    pub async fn presigned(&self, key: &str) -> Result<String, String> {
        self.presigned_url(key, self.default_expiry_secs).await
    }

    /// Generate a presigned GET URL for an optional key.
    /// Returns `Ok(None)` if the key is `None` or empty.
    pub async fn presigned_opt(&self, key: Option<String>) -> Result<Option<String>, String> {
        match key {
            Some(k) if !k.is_empty() => self.presigned(&k).await.map(Some),
            _ => Ok(None),
        }
    }

    /// Generate a presigned GET URL valid for `expires_in_secs` seconds.
    pub async fn presigned_url(&self, key: &str, expires_in_secs: u32) -> Result<String, String> {
        if key.is_empty() {
            return Err("empty key".to_string());
        }
        self.processed_bucket
            .presign_get(key, expires_in_secs, None)
            .await
            .map_err(|e| format!("failed to create presigned url: {e}"))
    }
}
