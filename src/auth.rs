use actix_session::Session;
use actix_web::{HttpResponse, get, post, web};
use argon2::{Argon2, PasswordHasher, PasswordVerifier};
use chrono::NaiveDateTime;
use sea_orm::{
    EntityTrait, QueryFilter, Set,
    sea_query::{Expr, Func},
};
use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

use crate::AppState;
use crate::entity::prelude::*;
use crate::entity::users;

const SESSION_MAX_AGE_DAYS: u64 = 3650;

#[derive(Serialize)]
pub struct AuthCheckResponse {
    pub authed: bool,
    pub username: Option<String>,
}

#[derive(Deserialize)]
pub struct Credentials {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub ok: bool,
    pub error: Option<String>,
}

fn validate_username(username: &str) -> Result<(), &'static str> {
    if username.len() < 3 {
        return Err("Username must be at least 3 characters");
    }
    if username.len() > 16 {
        return Err("Username must be 16 characters or fewer");
    }

    let bytes = username.as_bytes();

    // must start with a letter or digit
    if !bytes[0].is_ascii_alphanumeric() {
        return Err("Username must start with a letter or digit");
    }
    // must end with a letter or digit
    if !bytes[bytes.len() - 1].is_ascii_alphanumeric() {
        return Err("Username must end with a letter or digit");
    }
    // no leading hyphen (covered above by alphanumeric check, but explicit for clarity)
    // no trailing hyphen (covered above)
    // only letters, digits, and hyphens
    for &b in bytes {
        if !b.is_ascii_alphabetic() && !b.is_ascii_digit() && b != b'-' {
            return Err("Username can only contain letters, digits, and hyphens");
        }
    }
    // no consecutive hyphens (just a good practice)
    if bytes.windows(2).any(|w| w == b"--") {
        return Err("Username must not contain consecutive hyphens");
    }
    Ok(())
}

fn set_session_auth(session: &Session, user_id: Uuid, pw_changed_at: NaiveDateTime) {
    let ts = pw_changed_at.and_utc().timestamp() as u64;
    if let Err(e) = session.insert("user_id", user_id) {
        log::error!("Session insert error: {e}");
    }
    if let Err(e) = session.insert("password_changed_at", ts) {
        log::error!("Session insert error: {e}");
    }
}

#[get("/check")]
pub async fn auth_check(session: Session, state: web::Data<AppState>) -> HttpResponse {
    let session_pw_ts = session.get::<u64>("password_changed_at").ok().flatten();

    if let Some(session_pw_ts) = session_pw_ts {
        // max-age check
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let max_age = Duration::from_secs(SESSION_MAX_AGE_DAYS * 86400);
        if Duration::from_secs(now.checked_sub(session_pw_ts).unwrap_or(0)) > max_age {
            session.purge();
            return HttpResponse::Ok().json(AuthCheckResponse {
                authed: false,
                username: None,
            });
        }

        if let Ok(Some(user_id)) = session.get::<Uuid>("user_id") {
            let user = Users::find_by_id(user_id)
                .one(&state.conn)
                .await
                .ok()
                .flatten();

            if let Some(u) = user {
                let db_pw_ts = u.password_changed_at.and_utc().timestamp() as u64;
                // snapshot mismatch → password was changed since this session was created
                if db_pw_ts != session_pw_ts {
                    session.purge();
                } else {
                    return HttpResponse::Ok().json(AuthCheckResponse {
                        authed: true,
                        username: Some(u.username),
                    });
                }
            }
        }
    }

    HttpResponse::Ok().json(AuthCheckResponse {
        authed: false,
        username: None,
    })
}

#[post("/sign-up")] //register
pub async fn sign_up(
    session: Session,
    state: web::Data<AppState>,
    body: web::Json<Credentials>,
) -> HttpResponse {
    let username = body.username.trim();
    let password = &body.password;

    if let Err(e) = validate_username(username) {
        return HttpResponse::BadRequest().json(AuthResponse {
            ok: false,
            error: Some(e.to_string()),
        });
    }

    if password.len() < 8 {
        return HttpResponse::BadRequest().json(AuthResponse {
            ok: false,
            error: Some("Password must be at least 8 characters".to_string()),
        });
    }

    let existing = Users::find()
        .filter(
            Expr::expr(Func::lower(Expr::col(users::Column::Username))).eq(username.to_lowercase()),
        )
        .one(&state.conn)
        .await;

    match existing {
        Ok(Some(_)) => {
            return HttpResponse::Conflict().json(AuthResponse {
                ok: false,
                error: Some("Username unavailable".to_string()),
            });
        }
        Err(e) => {
            log::error!("DB error checking username: {e}");
            return HttpResponse::InternalServerError().json(AuthResponse {
                ok: false,
                error: Some("Something went wrong".to_string()),
            });
        }
        Ok(None) => {}
    }

    let password_hash = match argon2_to_hash(password) {
        Ok(h) => h,
        Err(_) => {
            return HttpResponse::InternalServerError().json(AuthResponse {
                ok: false,
                error: Some("Something went wrong".to_string()),
            });
        }
    };

    let user_id = Uuid::new_v4();

    let now = chrono::Utc::now().naive_utc();

    let insert = users::ActiveModel {
        id: Set(user_id),
        username: Set(username.to_string()),
        display_name: Set(username.to_string()),
        password_hash: Set(password_hash),
        password_changed_at: Set(now),
        ..Default::default()
    };

    if let Err(e) = Users::insert(insert).exec(&state.conn).await {
        log::error!("DB error inserting user: {e}");
        return HttpResponse::InternalServerError().json(AuthResponse {
            ok: false,
            error: Some("Something went wrong".to_string()),
        });
    }

    set_session_auth(&session, user_id, now);

    HttpResponse::Created().json(AuthResponse {
        ok: true,
        error: None,
    })
}

#[post("/sign-in")] // login
pub async fn sign_in(
    session: Session,
    state: web::Data<AppState>,
    body: web::Json<Credentials>,
) -> HttpResponse {
    let username = body.username.trim();
    let password = &body.password;

    let user = Users::find()
        .filter(
            Expr::expr(Func::lower(Expr::col(users::Column::Username))).eq(username.to_lowercase()),
        )
        .one(&state.conn)
        .await;

    let user = match user {
        Ok(Some(u)) => u,
        Ok(None) => {
            return HttpResponse::Unauthorized().json(AuthResponse {
                ok: false,
                error: Some("Invalid credentials".to_string()),
            });
        }
        Err(e) => {
            log::error!("DB error during sign-in: {e}");
            return HttpResponse::InternalServerError().json(AuthResponse {
                ok: false,
                error: Some("Something went wrong".to_string()),
            });
        }
    };

    let valid = Argon2::default()
        .verify_password(
            password.as_bytes(),
            &argon2::PasswordHash::new(&user.password_hash).unwrap(),
        )
        .is_ok();

    if !valid {
        return HttpResponse::Unauthorized().json(AuthResponse {
            ok: false,
            error: Some("Invalid credentials".to_string()),
        });
    }

    set_session_auth(&session, user.id, user.password_changed_at);

    HttpResponse::Ok().json(AuthResponse {
        ok: true,
        error: None,
    })
}

#[post("/sign-out")] // logout
pub async fn sign_out(session: Session) -> HttpResponse {
    session.purge();
    HttpResponse::Ok().json(AuthResponse {
        ok: true,
        error: None,
    })
}

fn argon2_to_hash(password: &str) -> Result<String, argon2::password_hash::Error> {
    use argon2::password_hash::rand_core::OsRng;
    let salt = argon2::password_hash::SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
}
