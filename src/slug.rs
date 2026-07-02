use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};
use uuid::Uuid;

use crate::entity::content_items;
use crate::entity::prelude::*;

/// URL-safe slug derived from a title via the `slug` crate.
pub fn slug_base(title: &str) -> String {
    let base = slug::slugify(title);
    if base.is_empty() {
        "untitled".to_string()
    } else {
        base
    }
}

async fn slug_taken(
    conn: &DatabaseConnection,
    slug: &str,
    exclude_id: Option<Uuid>,
) -> Result<bool, sea_orm::DbErr> {
    let mut q = ContentItems::find().filter(content_items::Column::Slug.eq(slug));
    if let Some(id) = exclude_id {
        q = q.filter(content_items::Column::Id.ne(id));
    }
    Ok(q.one(conn).await?.is_some())
}

/// Count items whose title slugifies to the same base (title-similarity, not slug column).
async fn count_same_slugified_titles(
    conn: &DatabaseConnection,
    base: &str,
    exclude_id: Option<Uuid>,
) -> Result<usize, sea_orm::DbErr> {
    let mut q = ContentItems::find();
    if let Some(id) = exclude_id {
        q = q.filter(content_items::Column::Id.ne(id));
    }
    let items = q.all(conn).await?;
    Ok(items
        .iter()
        .filter(|c| slug_base(&c.title) == base)
        .count())
}

/// Generate a unique slug for `title`.
///
/// Uniqueness is driven by title similarity: items whose titles slugify to the same
/// base share a numeric suffix (`name`, `name-2`, `name-3`, …). The slug column is
/// only checked to avoid accidental collisions from unrelated titles.
pub async fn unique_slug(
    conn: &DatabaseConnection,
    title: &str,
    exclude_id: Option<Uuid>,
) -> Result<String, sea_orm::DbErr> {
    let base = slug_base(title);
    let peer_count = count_same_slugified_titles(conn, &base, exclude_id).await?;

    if peer_count == 0 && !slug_taken(conn, &base, exclude_id).await? {
        return Ok(base);
    }

    let start = if peer_count == 0 { 2 } else { peer_count + 1 };
    for i in start..10_000 {
        let candidate = format!("{base}-{i}");
        if !slug_taken(conn, &candidate, exclude_id).await? {
            return Ok(candidate);
        }
    }

    Ok(format!("{}-{}", base, Uuid::new_v4().as_simple()))
}

/// Return the stored slug, generating and persisting one when missing.
pub async fn ensure_slug(
    conn: &DatabaseConnection,
    content: &content_items::Model,
) -> Result<String, sea_orm::DbErr> {
    if let Some(ref s) = content.slug {
        if !s.is_empty() {
            return Ok(s.clone());
        }
    }

    let slug = unique_slug(conn, &content.title, Some(content.id)).await?;
    let mut active: content_items::ActiveModel = content.clone().into();
    active.slug = Set(Some(slug.clone()));
    active.update(conn).await?;
    Ok(slug)
}
