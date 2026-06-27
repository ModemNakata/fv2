use actix_session::Session;
use actix_web::{HttpResponse, get, post, web};
use argon2::{Argon2, PasswordHasher, PasswordVerifier};
use chrono::NaiveDateTime;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set,
    sea_query::{Expr, Func},
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::AppState;
use crate::entity::prelude::*;
use crate::entity::users;

// const SESSION_MAX_AGE_DAYS: u64 = 3650;

#[derive(Clone, Serialize)]
pub struct SessionUser {
    pub username: String,
    pub avatar_url: Option<String>,
}

#[derive(Serialize)]
pub struct AuthCheckResponse {
    pub authed: bool,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Deserialize)]
pub struct Credentials {
    pub username: String,
    pub password: String,
    pub redirect: Option<String>,
}

#[derive(Deserialize)]
pub struct PasswordChange {
    pub current_password: Option<String>,
    pub new_password: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub ok: bool,
    pub error: Option<String>,
    pub redirect: Option<String>,
}

pub(crate) fn validate_username(username: &str) -> Result<(), &'static str> {
    if username.len() < 3 {
        return Err("Username must be at least 3 characters");
    }
    if username.len() > 30 {
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

pub async fn get_session_user(
    session: &Session,
    db: &sea_orm::DatabaseConnection,
) -> Option<SessionUser> {
    let session_pw_ts: Option<u64> = session.get("password_changed_at").ok().flatten();

    let session_pw_ts = session_pw_ts?;

    let user_id: Uuid = session.get("user_id").ok().flatten()?;

    let user = Users::find_by_id(user_id).one(db).await.ok().flatten()?;

    let db_pw_ts = user.password_changed_at.and_utc().timestamp() as u64;
    if db_pw_ts != session_pw_ts {
        session.purge();
        return None;
    }

    Some(SessionUser {
        username: user.username,
        avatar_url: user.avatar_url,
    })
}

pub async fn get_session_user_id(
    session: &Session,
    db: &sea_orm::DatabaseConnection,
) -> Option<Uuid> {
    let session_pw_ts: Option<u64> = session.get("password_changed_at").ok().flatten();
    let session_pw_ts = session_pw_ts?;
    let user_id: Uuid = session.get("user_id").ok().flatten()?;
    let user = Users::find_by_id(user_id).one(db).await.ok().flatten()?;
    let db_pw_ts = user.password_changed_at.and_utc().timestamp() as u64;
    if db_pw_ts != session_pw_ts {
        session.purge();
        return None;
    }
    Some(user.id)
}

pub async fn require_user(
    session: &Session,
    db: &DatabaseConnection,
) -> Result<users::Model, HttpResponse> {
    let session_user = get_session_user(session, db).await.ok_or_else(|| {
        HttpResponse::Unauthorized().json(serde_json::json!({
            "ok": false,
            "error": "Not signed in",
        }))
    })?;

    Users::find()
        .filter(users::Column::Username.eq(&session_user.username))
        .one(db)
        .await
        .ok()
        .flatten()
        .ok_or_else(|| {
            HttpResponse::InternalServerError().json(serde_json::json!({
                "ok": false,
                "error": "Failed to find user",
            }))
        })
}

#[get("/check")]
pub async fn auth_check(session: Session, state: web::Data<AppState>) -> HttpResponse {
    let session_user = get_session_user(&session, &state.conn).await;
    HttpResponse::Ok().json(AuthCheckResponse {
        authed: session_user.is_some(),
        username: session_user.as_ref().map(|u| u.username.clone()),
        avatar_url: session_user.and_then(|u| u.avatar_url),
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
            redirect: None,
        });
    }

    if password.len() < 8 {
        return HttpResponse::BadRequest().json(AuthResponse {
            ok: false,
            error: Some("Password must be at least 8 characters".to_string()),
            redirect: None,
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
                redirect: None,
            });
        }
        Err(e) => {
            log::error!("DB error checking username: {e}");
            return HttpResponse::InternalServerError().json(AuthResponse {
                ok: false,
                error: Some("Something went wrong".to_string()),
                redirect: None,
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
                redirect: None,
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
            redirect: None,
        });
    }

    set_session_auth(&session, user_id, now);

    let redirect = body.redirect.as_ref().filter(|r| !r.is_empty()).cloned();

    HttpResponse::Created().json(AuthResponse {
        ok: true,
        error: None,
        redirect,
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
                redirect: None,
            });
        }
        Err(e) => {
            log::error!("DB error during sign-in: {e}");
            return HttpResponse::InternalServerError().json(AuthResponse {
                ok: false,
                error: Some("Something went wrong".to_string()),
                redirect: None,
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
            redirect: None,
        });
    }

    set_session_auth(&session, user.id, user.password_changed_at);

    let redirect = body.redirect.as_ref().filter(|r| !r.is_empty()).cloned();

    HttpResponse::Ok().json(AuthResponse {
        ok: true,
        error: None,
        redirect,
    })
}

#[post("/instant-register")]
pub async fn instant_register(
    session: Session,
    state: web::Data<AppState>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> HttpResponse {
    let redirect = query.get("redirect").filter(|r| !r.is_empty()).cloned();
    let username = loop {
        let suffix: String = Uuid::new_v4().to_string()[..8].to_string();
        let username = format!("User_{}", suffix);

        let existing = Users::find()
            .filter(users::Column::Username.eq(&username))
            .one(&state.conn)
            .await;

        match existing {
            Ok(None) => break username,
            Ok(Some(_)) => continue,
            Err(e) => {
                log::error!("DB error checking username: {e}");
                return HttpResponse::InternalServerError().json(AuthResponse {
                    ok: false,
                    error: Some("Something went wrong".to_string()),
                    redirect: None,
                });
            }
        }
    };

    let user_id = Uuid::new_v4();
    let now = chrono::Utc::now().naive_utc();

    let insert = users::ActiveModel {
        id: Set(user_id),
        username: Set(username.clone()),
        display_name: Set(username.clone()),
        password_hash: Set("__no_password__".to_string()),
        password_changed_at: Set(now),
        ..Default::default()
    };

    if let Err(e) = Users::insert(insert).exec(&state.conn).await {
        log::error!("DB error inserting anonymous user: {e}");
        return HttpResponse::InternalServerError().json(AuthResponse {
            ok: false,
            error: Some("Something went wrong".to_string()),
            redirect: None,
        });
    }

    set_session_auth(&session, user_id, now);

    HttpResponse::Created().json(AuthResponse {
        ok: true,
        error: None,
        redirect,
    })
}

#[post("/sign-out")] // logout
pub async fn sign_out(session: Session) -> HttpResponse {
    session.purge();
    HttpResponse::Ok().json(AuthResponse {
        ok: true,
        error: None,
        redirect: None,
    })
}

fn argon2_to_hash(password: &str) -> Result<String, argon2::password_hash::Error> {
    use argon2::password_hash::rand_core::OsRng;
    let salt = argon2::password_hash::SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
}

#[post("/password")]
pub async fn set_or_change_password(
    session: Session,
    state: web::Data<AppState>,
    body: web::Json<PasswordChange>,
) -> HttpResponse {
    let user = match require_user(&session, &state.conn).await {
        Ok(u) => u,
        Err(resp) => return resp,
    };

    if body.new_password.len() < 8 {
        return HttpResponse::BadRequest().json(AuthResponse {
            ok: false,
            error: Some("Password must be at least 8 characters".to_string()),
            redirect: None,
        });
    }

    let has_password = user.password_hash != "__no_password__";

    if has_password {
        let current = body.current_password.as_deref().unwrap_or("");
        let valid = Argon2::default()
            .verify_password(
                current.as_bytes(),
                &argon2::PasswordHash::new(&user.password_hash).unwrap(),
            )
            .is_ok();

        if !valid {
            return HttpResponse::Unauthorized().json(AuthResponse {
                ok: false,
                error: Some("Current password is incorrect".to_string()),
                redirect: None,
            });
        }
    }

    let password_hash = match argon2_to_hash(&body.new_password) {
        Ok(h) => h,
        Err(_) => {
            return HttpResponse::InternalServerError().json(AuthResponse {
                ok: false,
                error: Some("Something went wrong".to_string()),
                redirect: None,
            });
        }
    };

    let now = chrono::Utc::now().naive_utc();

    let user_id = user.id;
    let mut active: users::ActiveModel = user.into();
    active.password_hash = Set(password_hash);
    active.password_changed_at = Set(now);

    if let Err(e) = active.update(&state.conn).await {
        log::error!("DB error updating password: {e}");
        return HttpResponse::InternalServerError().json(AuthResponse {
            ok: false,
            error: Some("Failed to update password".to_string()),
            redirect: None,
        });
    }

    set_session_auth(&session, user_id, now);

    HttpResponse::Created().json(AuthResponse {
        ok: true,
        error: None,
        redirect: None,
    })
}
