# FeVid Paid Content System — Roadmap & Developer Guide

## Goal

Turn FeVid into a platform where creators can upload videos and galleries, optionally set a price, and have the system deliver **free previews** to non-purchasing users while showing **full content** only to uploaders and purchasers.

The MVP target: a creator uploads a priced video or gallery, sets a preview length or unblurred count, the backend stores it, a pipeline generates the preview assets, and the frontend serves the right content depending on who's viewing.

---

## Current State (What's Built)

### Database Schema

**`content_items` table** — each row is either a video or an image_set gallery:
- `price_cents: i32` — price in USD cents (0 = free)
- `is_paywalled: bool` — denormalized flag (`price_cents > 0`), indexed for feed filtering
- Types: `ContentType::Video | ImageSet`
- Statuses: `uploading → processing → ready | failed`

**`videos` table** (1:1 with content_items where type=Video):
- `free_preview_duration_s: Option<i32>` — how many seconds of free preview to trim
- `preview_path: Option<String>` — reused: hover preview for free content, free preview clip for paywalled

**`image_sets` table** (1:1 with content_items where type=ImageSet):
- `unblurred_count: Option<i32>` — how many leading images to leave unblurred

**`images` table** (N:1 with image_sets):
- `blurred_storage_path: Option<String>` — S3 key of blurred WebP version

Index: `idx_content_paywalled_feed` on `(is_paywalled, status, created_at DESC)`.

### Upload Flow (`src/upload.rs`)

- `upload_video`: parses `"price"` (float → cents), `"preview_length"` (seconds) from multipart form. Sets `price_cents`, `is_paywalled` on content, `free_preview_duration_s` on video record.
- `upload_gallery`: parses `"price"`, `"unblurred_count"` (integer). Sets `price_cents`, `is_paywalled` on content, `unblurred_count` on image_set record.
- Both follow same pattern: parse text fields → S3 multipart upload → insert DB records → set status to `processing`.

### Pipeline API (`src/pipeline.rs`)

Endpoint contract for the external encoding pipeline:

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/pending-processing` | None | Returns items with `status=processing`, including `is_paywalled`, `price_cents`, `free_preview_duration_s`, `unblurred_count`, and original file paths |
| `GET /api/content/{id}` | None | Single item lookup |
| `PATCH /api/content/{id}/status` | `X-Api-Key` | Pipeline reports completion: sends `status`, `free_preview_path` (video), `blurred_files` (gallery), `processed_files`, `thumbnail_url`, `duration` |

The `item_to_pending` function builds `PendingItem` JSON with video/image-set lookups via `videos_map` and `image_sets_map`. The `update_status` handler stores `free_preview_path` into `videos.preview_path` and `blurred_files` into `images.blurred_storage_path`.

### Serving Logic

**Video** (`src/video.rs:86-95`): if `is_paywalled && !is_uploader`, `source_url` = `videos.preview_path` (free preview clip). Otherwise, full HLS master playlist.

**Gallery** (`src/gallery.rs:376-398`): if paywalled + not uploader, images at index ≥ `unblurred_count` use `blurred_storage_path` instead of `storage_path`.

**Templates** (`templates/video.html`, `templates/gallery.html`):
- Shows a `.free-preview-banner` with "Free Preview · Full content · $X.XX" when `is_paywalled && is_free_preview`.

### Frontend Upload UI

**Upload Video** (`templates/upload-video.html`):
- Price input (`$` prefix, `step=1`, integer dollars)
- Range slider for preview duration (5–60s) — only visible when price > 0
- Client-side: detects video duration via `<video>` element, validates preview ≤ duration/2, disables submit until valid
- Sends `price`, `preview_length` in form data

**Upload Gallery** (`templates/upload-gallery.html`):
- Price input (`$` prefix, `step=1`, integer dollars)
- Unblurred count buttons (1, 2, 3) — only visible when price > 0
- Client-side: validates images ≥ 2× unblurred count
- Sends `price`, `unblurred_count` in form data

### Static Files

- `static/css/video.css` — `.free-preview-banner` styles (gold accent, currency icon)
- `static/css/gallery.css` — same banner styling for galleries
- `static/css/upload-video.css` — price prefix, range slider, conditional field visibility
- `static/css/upload-gallery.css` — same, plus `.count-btn` active state styling
- All mobile-first, uses CSS custom properties from `style.css`

### Documentation

- `PIPELINE_API.md` — full API spec with paid content fields documented
- `AGENTS.md` — project guide (stack, conventions, templates, video player)

---

## What's Missing (Next Steps for MVP)

### 1. Purchase Tracking

**Problem**: Currently `is_free_preview` = `is_paywalled && !is_uploader`. This means everyone except the uploader sees the preview. We need purchase state so actual buyers see full content.

**Two approaches** (pick one):

**A. Session-based (simpler, ephemeral)**:
```
// Add purchased_content_ids to session
// In video.rs / gallery.rs:
let purchased_ids: Vec<Uuid> = session
    .get::<Vec<Uuid>>("purchased_content_ids")
    .unwrap_or_default()
    .unwrap_or_default();
let has_purchased = purchased_ids.contains(&content_id);
let is_free_preview = is_paywalled && !is_uploader && !has_purchased;
```

**B. Purchases table (persistent, proper)**:

```sql
CREATE TABLE purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id UUID NOT NULL REFERENCES users(id),
    content_id UUID NOT NULL REFERENCES content_items(id),
    price_cents INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(buyer_id, content_id)
);
```

Then in the handlers: query the purchases table.

**Files to change**:
- `src/video.rs:87` — change `is_free_preview` logic
- `src/gallery.rs:377` — same
- Possibly add a `has_purchased` helper function in a new `src/purchase.rs`

### 2. Pipeline External Process

**Problem**: The preview clips and blurred images don't exist yet. The pipeline is a **separate process** (not in this repo) that reads from `GET /api/pending-processing`, processes files, and calls back with `PATCH`.

**Minimum pipeline spec**:

```python
# psuedo-code for the external pipeline
while True:
    items = GET /api/pending-processing
    for item in items:
        download_original_from_s3(item.files[0].path)

        if item.content_type == "video":
            encode_h264(input, output_dir)  # existing pipeline work
            generate_thumbnail(input, output_dir)
            generate_preview_clip(input, output_dir, duration=3)

            if item.is_paywalled:
                trim_free_preview(input, output_dir, item.free_preview_duration_s)
                # uploads to S3_BUCKET
                # sends PATCH with free_preview_path

        elif item.content_type == "image_set":
            for i, file in enumerate(item.files):
                convert_to_webp(input, output_dir)

                if item.is_paywalled and i >= item.unblurred_count:
                    blur_image(input, output_dir)
                    # blurred file stored; adds to blurred_files[]

            # sends PATCH with blurred_files

        # sends PATCH with status="ready", processed_files, etc.
```

**Requirements**: Python or Node script, FFmpeg for video trimming, ImageMagick/Pillow for blur. See `PIPELINE_API.md` for full endpoint contract.

### 3. Purchase UI

**Video page** — when paywalled + free preview:
- Add a purchase bar **below the player** (or overlaid) showing price and a "Purchase" button
- The free preview banner already exists — wire the "Full video · $X.XX" text as a purchase CTA
- On successful purchase (to be implemented): reload page showing full content

**Gallery page** — when paywalled + free preview:
- Add a sticky bottom purchase bar with price + purchase button
- Blurred images should have a tap-to-reveal or overlay saying "Purchase to view"

**Purchase flow**:
- User clicks "Purchase" → hits an API endpoint
- API: if session-based, add `content_id` to session; if purchases table, insert a row
- Then redirect back to content page (which now renders full content)

### 4. Feed / Listing Visibility

Currently the gallery listing (`src/gallery.rs:106-108`) filters on `visibility=Public` and `status=Ready` but does NOT filter out paywalled content from non-purchasers.

**Options**:
- **Hide paywalled** from non-purchasers in listings (clean but discoverability suffers)
- **Show with overlay** — show the card but with a lock icon and price badge
- **Show if uploader** — show full, hide for others

The `idx_content_paywalled_feed` index is ready for whichever approach.

### 5. Upload Frontend Polish

Current rough edges:
- "Detecting duration..." during video metadata load — consider a friendlier message or spinner
- No price step validation beyond integers — consider allowing `0.99` etc.
- No visual feedback on the pricing conditional fields transition — they appear/disappear instantly, could use a subtle transition

### 6. Balance / Withdrawal Pages

There's already a `src/balance.rs` and `templates/balance.html` — likely stubs for a wallet/earnings system. Needs wiring:
- Track creator earnings (from purchases)
- Withdrawal requests
- Transaction history

---

## Implementation Order

```
Phase 1 (MVP core)
├── 1. Purchase tracking (session or table)
├── 2. Pipeline external process (basic trim + blur)
└── 3. Purchase button + purchase API endpoint

Phase 2 (discoverability + polish)
├── 4. Feed listing with paywalled badges/visibility
├── 5. Upload UI polish
└── 6. Balance + earnings

Phase 3 (production hardening)
├── Purchase verification/receipts
├── Creator payout system
├── Refund handling
└── Tax/invoice support
```

---

## Key Technical Details

### Stack
- **Backend**: actix-web 4 + SeaORM (Postgres)
- **Templates**: Askama 0.16 (server-side Rust, no JS framework)
- **Sessions**: actix-session (cookie-backed, encrypted)
- **Auth**: argon2 password hashing (see `src/auth.rs`)
- **Static**: nginx serves `/static/` → `static/` directory
- **S3**: rust-s3 for uploads; `S3_ORIG_BUCKET` for originals, `S3_BUCKET` for processed

### Key Source Files

| File | What it does |
|------|-------------|
| `src/main.rs` | Server bootstrap, route registration, AppState |
| `src/upload.rs` | Multipart upload handling (both video + gallery) |
| `src/pipeline.rs` | Pipeline API endpoints (`/api/pending-processing`, status PATCH) |
| `src/video.rs` | Video detail page handler + paid content serving logic |
| `src/gallery.rs` | Gallery detail + listing page handlers + paid content serving |
| `src/auth.rs` | Session user helpers (`get_session_user`, `get_session_user_id`, `require_user`) |
| `src/entity/` | SeaORM auto-generated models (content_items, videos, image_sets, images, etc.) |
| `migration/src/m20260610_120444_content.rs` | Full schema with paid content columns |
| `templates/video.html` | Video page template with free-preview-banner |
| `templates/gallery.html` | Gallery page template with free-preview-banner |
| `templates/upload-video.html` | Upload form with price + preview length |
| `templates/upload-gallery.html` | Upload form with price + unblurred count |
| `static/css/video.css` | Video page styles (free-preview-banner, etc.) |
| `PIPELINE_API.md` | Full API contract for the encoding pipeline |

### Running the Project

```bash
# Start Postgres
docker compose up -d

# Run migrations (from project root)
cargo run --manifest-path migration/Cargo.toml -- up

# Start dev server
cargo run

# Check compilation
cargo check
```

### Guiding Principles

- **Mobile-first CSS**: default styles target mobile, `min-width` breakpoints scale up
- **Sharp corners**: no `border-radius` anywhere — flat, minimal UI
- **Pipeline API is the contract**: the Rust backend never processes media — it stores uploads and serves results. The pipeline (external) does the encoding.
- **Price as cents (i32)**: avoids float rounding issues. `format!("{:.2}", cents as f64 / 100.0)` for display.
- **Don't modify generated entities**: `src/entity/` is auto-generated by `sea-orm-cli`. Regenerate with `sea-orm-cli generate entity -o src/entity` after migration changes.

---

## What a Fresh Session Should Do First

1. **Read this file** (`PAID_CONTENT_ROADMAP.md`) to understand current state
2. **Read `AGENTS.md`** for project conventions and stack details
3. **Run `cargo check`** to verify compilation
4. **Read `PAID_CONTENT.md`** if it exists (the old implementation plan)
5. **Pick Phase 1, step 1** (purchase tracking) as the first actionable task
6. Make incremental changes, run `cargo check` after each, let user verify


---
for uploaders: tip - open this page in incognito mode to see how users see this paywalled item

PREVIOUS CONTEXT ON UI:
---


On UI: the current banner is functional but doesn't guide the user toward purchasing. A few
suggestions:

### Upload page (creator)

Current price input + conditional fields is clear enough. One polish: show a preview card below the
settings — "Visitors will see: 30s preview / first 2 images unblurred" — so the creator understands
the trade-off before publishing.

### Video page (fan)

Replace the text banner with a purchase overlay on the player:

• Player plays the free preview normally
• At the bottom, an overlay bar (semi-transparent, always visible):  [🔒 Full video · $4.99]
[Purchase button]
• Audio continues playing under the overlay
• The overlay is dismissible (X) so the user can watch the preview in full screen if they want

### Gallery page (fan)

Blurred images with a small lock icon in the corner is enough. Add a sticky bottom bar that appears
when scrolling past the unblurred set:  "Unlock all N images · $X.XX"  with a purchase button. The
bar stays fixed as they scroll through blurred images.

### Reusable component

A small  .purchase-badge  pill next to the title on both pages showing  $X.XX  in accent color, so
users immediately know it's paid content before scrolling.
