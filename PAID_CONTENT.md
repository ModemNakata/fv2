# Paid Content — Implementation Plan

## Overview

Enable creators to set a price on uploads. Free content works as today. Paywalled content requires the pipeline to produce two tiers: a **free preview** (short clip / limited unblurred images) and the **full content** behind the paywall.

---

## 1. Database Migration (`migration/src/m2026xxxx_xxxxxx_paid_content.rs`)

### `content_items` — new columns

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `price_cents` | `integer NOT NULL` | `0` | Price in USD cents (0 = free). Stored as integer to avoid float rounding. |
| `is_paywalled` | `boolean NOT NULL` | `false` | Derived: `price_cents > 0`. Denormalized for fast query filtering. |

```rust
.col(integer("price_cents").default(0).not_null())
.col(boolean("is_paywalled").default(false).not_null())
```

### `videos` — new column

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `free_preview_duration_s` | `integer NULL` | — | Seconds of free preview (5–60). `NULL` when not paywalled. |

```rust
.col(integer_null("free_preview_duration_s"))
```

### `image_sets` — new column

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `unblurred_count` | `integer NULL` | — | How many leading images stay unblurred (1–3). `NULL` when not paywalled. |

```rust
.col(integer_null("unblurred_count"))
```

### `images` — new column

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `blurred_storage_path` | `text NULL` | — | S3 key to the blurred WebP version. `NULL` for free content or for images within the unblurred set. |

```rust
.col(string_len_null("blurred_storage_path", 1024))
```

### Index

```rust
.index(
    Index::create()
        .name("idx_content_paywalled_feed")
        .col("is_paywalled")
        .col("status")
        .col("created_at")
)
```

---

## 2. Entity Updates (`src/entity/`)

Re-generate with `sea-orm-codegen` or manually add fields. The new fields are:

**`content_items.rs`**:
```rust
pub price_cents: i32,
pub is_paywalled: bool,
```

**`videos.rs`**:
```rust
pub free_preview_duration_s: Option<i32>,
```

**`image_sets.rs`**:
```rust
pub unblurred_count: Option<i32>,
```

**`images.rs`**:
```rust
pub blurred_storage_path: Option<String>,
```

---

## 3. Upload Handler (`src/upload.rs`)

### `upload_video`

Parse from multipart:

```rust
"price" => { /* parse i32 (cents: value * 100) */ }
"preview_length" => { /* parse i32, only used when price > 0 */ }
```

Store in `content_items::ActiveModel`:
```rust
price_cents: Set((price_f64 * 100.0).round() as i32),
is_paywalled: Set(price_f64 > 0.0),
```

Store in `videos::ActiveModel`:
```rust
free_preview_duration_s: Set(if is_paywalled { Some(preview_length) } else { None }),
```

### `upload_gallery`

Parse:
```rust
"price" => { /* parse i32 (cents) */ }
"unblurred_count" => { /* parse i32, 1-3 */ }
```

Store on `content_items`:
Same `price_cents` / `is_paywalled` logic.

Store on `image_sets::ActiveModel`:
```rust
unblurred_count: Set(if is_paywalled { Some(count) } else { None }),
```

---

## 4. Pipeline API Changes (`src/pipeline.rs`)

### `GET /api/pending-processing`

Add to `PendingItem` struct and JSON response:

| New field | Type | Description |
|-----------|------|-------------|
| `is_paywalled` | `bool` | Whether this item requires paid-content processing |
| `price_cents` | `int` | Price in cents (0 = free) |
| `free_preview_duration_s` | `int \| null` | (Video only) Seconds for the free preview clip |
| `unblurred_count` | `int \| null` | (Gallery only) How many leading images stay clear |

The pipeline (external process) uses these fields to decide:
- Whether to generate a preview clip or blurred variants at all
- How long the preview clip should be
- How many gallery images to leave unblurred

### `PATCH /api/content/{id}/status`

Add optional fields to `StatusUpdate` struct:

| New field | Type | Description |
|-----------|------|-------------|
| `free_preview_path` | `string \| null` | S3 key of the generated free preview clip (video). Stored in `videos.preview_path`. |
| `blurred_files` | `string[] \| null` | (Gallery only) S3 keys of blurred WebP versions, **in the same order as `processed_files`**. Matched by `sort_order` — images at index ≥ `unblurred_count` get their `blurred_storage_path` set. |

**Processing logic** (in `update_status`):

```rust
// For paywalled videos — store free preview path
if let Some(ref preview) = body.free_preview_path {
    if let Ok(Some(video)) = Videos::find_by_id(content_id).one(&state.conn).await {
        let mut video: videos::ActiveModel = video.into();
        video.preview_path = Set(Some(preview.clone()));
        video.update(&state.conn).await?;
    }
}

// For paywalled galleries — store blurred image paths
if let Some(ref blurred) = body.blurred_files {
    if let Ok(imgs) = Images::find()
        .filter(images::Column::ImageSetId.eq(content_id))
        .order_by(images::Column::SortOrder, sea_orm::Order::Asc)
        .all(&state.conn)
        .await
    {
        for (i, img) in imgs.iter().enumerate() {
            if let Some(path) = blurred.get(i) {
                let mut img: images::ActiveModel = img.clone().into();
                img.blurred_storage_path = Set(Some(path.clone()));
                img.update(&state.conn).await?;
            }
        }
    }
}
```

---

## 5. Pipeline External Process (separate repo)

### For paywalled videos (price > 0):

1. Normal HLS encoding (same as today) → stored as processed
2. **Additional**: Trim the first `free_preview_duration_s` seconds from the source video
3. Encode that clip as a lightweight WebM or MP4
4. Upload to `S3_BUCKET` as `videos/{content_id}/free_preview.mp4`
5. Send `free_preview_path` in the PATCH call

### For paywalled galleries (price > 0):

1. Normal WebP conversion for all images (same as today)
2. **Additional**: For images at index >= `unblurred_count`, also generate a **blurred WebP**:
   - Apply Gaussian blur (e.g., radius 12px) via `image` crate / `libvips`
   - Reduce quality to 30% to keep file size low
3. Upload blurred WebPs to `S3_BUCKET` as `galleries/{content_id}/blurred_{index}.webp`
4. Send `blurred_files` array in the PATCH call

---

## 6. Serving Paid Content

### Video page (`src/video.rs`)

```rust
// If paywalled AND user hasn't purchased:
//   - Serve the free preview clip (videos.preview_path) instead of the full HLS master
//   - Show overlay: "Purchase for $X to watch full video"
// If user has purchased:
//   - Serve full HLS stream as today
```

### Gallery page (`src/gallery.rs`)

```rust
// For each image in the gallery:
//   if is_paywalled AND sort_order >= unblurred_count AND user hasn't purchased:
//       serve images.blurred_storage_path instead of storage_path
//   else:
//       serve images.storage_path (the clear WebP)
```

### Purchase state check

```rust
// Option A: Simple session flag (no persistence across logins)
// Option B: purchases table (persistent, preferred)
```

Recommendation: Create a `purchases` table (future migration) — but for MVP, a session-level `purchased_content_ids: Vec<Uuid>` stored in `actix-session` works.

---

## 7. File Overview

| File | Change |
|------|--------|
| `migration/src/lib.rs` | Register new migration |
| `migration/src/m2026xxxx_xxxxxx_paid_content.rs` | New migration: add columns |
| `src/entity/content_items.rs` | Add `price_cents`, `is_paywalled` |
| `src/entity/videos.rs` | Add `free_preview_duration_s` |
| `src/entity/image_sets.rs` | Add `unblurred_count` |
| `src/entity/images.rs` | Add `blurred_storage_path` |
| `src/upload.rs` | Parse price/preview/unblurred from form, store in DB |
| `src/pipeline.rs` | Add fields to `PendingItem`, `StatusUpdate`, handle blurred/preview paths |
| `PIPELINE_API.md` | Document new request/response fields |
| `src/video.rs` | Serve free preview for paywalled-unowned content |
| `src/gallery.rs` | Serve blurred images for paywalled-unowned content |

---

## 8. Migration SQL (for reference)

```sql
ALTER TABLE content_items
  ADD COLUMN price_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN is_paywalled boolean NOT NULL DEFAULT false;

ALTER TABLE videos
  ADD COLUMN free_preview_duration_s integer NULL;

ALTER TABLE image_sets
  ADD COLUMN unblurred_count integer NULL;

ALTER TABLE images
  ADD COLUMN blurred_storage_path varchar(1024) NULL;

CREATE INDEX idx_content_paywalled_feed
  ON content_items (is_paywalled, status, created_at DESC);
```
