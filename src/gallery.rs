use actix_session::Session;
use actix_web::{Responder, Result, web};
use askama::Template;

use crate::AppState;
use crate::auth;

#[derive(Template)]
#[template(path = "gallery.html")]
struct GalleryPage {
    logged_in: bool,
    title: String,
    images: Vec<GalleryImage>,
}

struct GalleryImage {
    url: String,
    alt: String,
}

pub async fn gallery(session: Session, state: web::Data<AppState>) -> Result<impl Responder> {
    let logged_in = auth::get_session_user(&session, &state.conn)
        .await
        .is_some();

    let image_names = [
        ("01_Gwen_Black_Minidress.webp", "Gwen Black Minidress 1"),
        ("02_Gwen_Black_Minidress_2.webp", "Gwen Black Minidress 2"),
        ("03_Gwen_Black_Minidress_3.webp", "Gwen Black Minidress 3"),
        ("04_Gwen_Black_Minidress_4.webp", "Gwen Black Minidress 4"),
        ("05_Gwen_Black_Minidress_5.webp", "Gwen Black Minidress 5"),
        ("06_Gwen_Black_Minidress_6.webp", "Gwen Black Minidress 6"),
        ("07_Gwen_Black_Minidress_7.webp", "Gwen Black Minidress 7"),
        ("08_Gwen_Black_Minidress_8.webp", "Gwen Black Minidress 8"),
        ("09_Gwen_Black_Minidress_9.webp", "Gwen Black Minidress 9"),
        ("10_Gwen_Black_Minidress_10.webp", "Gwen Black Minidress 10"),
        ("11_Gwen_Black_Minidress_11.webp", "Gwen Black Minidress 11"),
        ("12_Gwen_Black_Minidress_12.webp", "Gwen Black Minidress 12"),
        ("13_Gwen_Black_Minidress_13.webp", "Gwen Black Minidress 13"),
        ("14_Gwen_Black_Minidress_14.webp", "Gwen Black Minidress 14"),
        ("15_Gwen_Black_Minidress_15.webp", "Gwen Black Minidress 15"),
        ("16_Gwen_Black_Minidress_16.webp", "Gwen Black Minidress 16"),
        ("17_Gwen_Black_Minidress_17.webp", "Gwen Black Minidress 17"),
        ("18_Gwen_Black_Minidress_18.webp", "Gwen Black Minidress 18"),
        ("19_Gwen_Black_Minidress_19.webp", "Gwen Black Minidress 19"),
        ("20_Gwen_Black_Minidress_20.webp", "Gwen Black Minidress 20"),
    ];

    let images: Vec<GalleryImage> = image_names
        .iter()
        .map(|(name, alt)| GalleryImage {
            url: format!("https://local.test/bucket/image-set-xyz/{name}"),
            alt: alt.to_string(),
        })
        .collect();

    let html = GalleryPage {
        logged_in,
        title: "Gwen Black Minidress".to_string(),
        images,
    }
    .render()
    .expect("gallery.html should be valid");
    Ok(web::Html::new(html))
}
