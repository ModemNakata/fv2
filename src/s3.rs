use s3::Bucket;
use s3::creds::Credentials;
use s3::region::Region;
use std::env;

pub fn init_bucket() -> Bucket {
    let endpoint = env::var("S3_ENDPOINT").expect("S3_ENDPOINT is not set in .env");
    let access_key = env::var("S3_ACCESS_KEY").expect("S3_ACCESS_KEY is not set in .env");
    let secret_key = env::var("S3_SECRET_KEY").expect("S3_SECRET_KEY is not set in .env");
    let region_str = env::var("S3_REGION").unwrap_or_else(|_| "us-east-1".to_string());
    let bucket_name = env::var("S3_BUCKET").expect("S3_BUCKET is not set in .env");

    let credentials =
        Credentials::new(Some(&access_key), Some(&secret_key), None, None, None)
            .expect("failed to create S3 credentials");

    let region = Region::Custom {
        region: region_str,
        endpoint,
    };

    *Bucket::new(&bucket_name, region, credentials)
        .expect("failed to create S3 bucket")
        .with_path_style()
}
