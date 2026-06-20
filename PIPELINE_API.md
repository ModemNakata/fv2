# Pipeline API

Internal HTTP endpoints used by the AV1 + AVIF processing pipeline to discover and update unprocessed content.

## Auth

| Endpoint | Auth |
|----------|------|
| `GET /api/pending-processing` | None |
| `GET /api/content/{id}` | None |
| `PATCH /api/content/{id}/status` | `X-Api-Key` header must match `PIPELINE_RAND_HEX` from `.env` |

## Flow

```
User uploads original file
         │
         ▼
Content status = uploading ──► original file stored in S3_ORIG_BUCKET
         │
         ▼
Content status = processing ◄── pipeline picks up here
         │
         ▼
Pipeline encodes AV1 + AVIF at multiple resolutions, uploads to S3_BUCKET
         │
         ├── Records source_resolution via PATCH (e.g. "1920x1080")
         │
         ├── Free content ──► calls PATCH /api/content/{id}/status (ready)
         │
         └── Paywalled content
                 │
                 ├── Video: trim free_preview_duration_s clip, encode same ABR ladder
                 │         ► calls PATCH with free_preview_path per video_formats entry
                 │
                 └── Gallery: blur images at index ≥ unblurred_count
                           ► calls PATCH with blurred_files
         │
         ├── status="ready"   → content available to users
         └── status="failed"  → content marked as failed
```

---

## `GET /api/pending-processing`

Returns all content items with `status = processing` (upload complete, awaiting encoding).

### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `all` | `bool` | `false` | If `true`, returns all items regardless of status (dev/testing feature). |

### Response `200 OK`

```json
[
  {
    "content_id": "550e8400-e29b-41d4-a716-446655440000",
    "content_type": "video",
    "title": "My Great Video",
    "uploader_name": "alice",
    "is_paywalled": true,
    "price_cents": 499,
    "free_preview_duration_s": 30,
    "files": [
      {
        "path": "videos/a1b2c3d4-e5f6-7890-abcd-ef1234567890.webm"
      }
    ]
  },
  {
    "content_id": "660e8400-e29b-41d4-a716-446655440001",
    "content_type": "image_set",
    "title": "Photo Album",
    "uploader_name": "bob",
    "is_paywalled": false,
    "price_cents": 0,
    "files": [
      {
        "path": "galleries/x1y2z3d4-e5f6-7890-abcd-ef1234567890.avif"
      },
      {
        "path": "galleries/a2b3c4d5-e6f7-8901-bcde-f12345678901.avif"
      }
    ]
  }
]
```

### Response `200 OK` (empty)

```json
[]
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `content_id` | UUID (string) | Unique content identifier |
| `content_type` | string | Either `"video"` or `"image_set"` |
| `title` | string | User-provided title |
| `uploader_name` | string | Username of the uploader |
| `is_paywalled` | bool | Whether this item requires purchase. When `true`, the pipeline must generate free preview assets. |
| `price_cents` | int | Price in USD cents. `0` means free. |
| `free_preview_duration_s` | int \| null | (Video only) Seconds of free preview the pipeline should trim from the source. Only present when `is_paywalled` is `true`. |
| `unblurred_count` | int \| null | (Gallery only) How many leading images to leave unblurred. Images at index ≥ this value must be blurred by the pipeline. Only present when `is_paywalled` is `true`. |
| `files` | array | One file for video, potentially multiple for image_set |
| `files[].path` | string | Key of the **original** file in **S3_ORIG_BUCKET** (before processing), suitable for `GetObject`. Stored in `orig_storage_path`. |

### Notes

- `path` values are relative to `S3_ORIG_BUCKET`
- Videos always return exactly one file (the original upload)
- Image sets return all images ordered by `sort_order`
- For paywalled items (`is_paywalled=true`), the pipeline **must also**:
  - **Video**: Trim the first `free_preview_duration_s` seconds from the source, encode the full ABR ladder, and include `free_preview_path` in each `video_formats` entry
  - **Gallery**: For images at index ≥ `unblurred_count`, generate a **blurred `.avif`** version, and send all blurred keys back via `blurred_files` (same order as `files[]`)

---

## `GET /api/content/{id}`

Returns a single content item by ID (any status). Useful for the pipeline's `--uuid` direct mode to resolve the original file mapping without needing `--file`.

### Response `200 OK`

```json
{
  "content_id": "13e535ad-3020-4b0c-be99-eadf99a65620",
  "content_type": "video",
  "title": "123",
  "uploader_name": "alice",
  "files": [
    {
      "path": "videos/e31cca56-3c62-4f80-bff9-edf62cfae12d.webm"
    }
  ]
}
```

### Response `404 Not Found`

```json
{ "error": "Content not found" }
```

### Fields

Same shape as one item from `GET /api/pending-processing`.

---

## `PATCH /api/content/{id}/status`

Updates the processing status of a content item after the pipeline finishes.

### Headers

| Header | Value |
|--------|-------|
| `X-Api-Key` | `PIPELINE_RAND_HEX` from `.env` (required) |
| `Content-Type` | `application/json` |

### Request Body

```json
{
  "status": "ready",
  "source_quality": "1080p60",
  "source_resolution": "1920x1080",
  "thumbnail_url": "videos/550e8400-e29b-41d4-a716-446655440000/thumbnail.avif",
  "preview_path": "videos/550e8400-e29b-41d4-a716-446655440000/preview.webm",
  "duration": 13.2,
  "video_formats": {
    "1920x1080": {
      "storage_path": "videos/550e8400-e29b-41d4-a716-446655440000/1080p.webm",
      "free_preview_path": "videos/550e8400-e29b-41d4-a716-446655440000/free_preview/1080p.webm"
    },
    "1280x720": {
      "storage_path": "videos/550e8400-e29b-41d4-a716-446655440000/720p.webm",
      "free_preview_path": "videos/550e8400-e29b-41d4-a716-446655440000/free_preview/720p.webm"
    },
    "854x480": {
      "storage_path": "videos/550e8400-e29b-41d4-a716-446655440000/480p.webm",
      "free_preview_path": "videos/550e8400-e29b-41d4-a716-446655440000/free_preview/480p.webm"
    }
  },
  "blurred_files": [
    "",
    "",
    "galleries/660e8400-e29b-41d4-a716-446655440001/blurred_2.avif",
    "galleries/660e8400-e29b-41d4-a716-446655440001/blurred_3.avif"
  ]
}
```

For non-paywalled content, `video_formats` entries omit `free_preview_path`:

```json
{
  "video_formats": {
    "1920x1080": {
      "storage_path": "videos/550e8400-e29b-41d4-a716-446655440000/1080p.webm"
    },
    "1280x720": {
      "storage_path": "videos/550e8400-e29b-41d4-a716-446655440000/720p.webm"
    },
    "854x480": {
      "storage_path": "videos/550e8400-e29b-41d4-a716-446655440000/480p.webm"
    }
  }
}
```

> **Note:** The old format (`video_formats` values as plain strings) is still accepted for backward compatibility. The pipeline now sends the object format only when `free_preview_path` entries are included.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | yes | `"ready"` or `"failed"` |
| `source_quality` | string | no | Detected quality of the original source video (e.g. `"1080p60"`, `"720p"`, `"4K"`). Determined via ffprobe before encoding. Stored in `videos.source_quality`. Only applies to videos. |
| `source_resolution` | string | no | Original source resolution in `"WxH"` format (e.g. `"1920x1080"`). Determined via ffprobe. Stored in `videos.source_resolution`. Only applies to videos. |
| `thumbnail_url` | string | no | S3 key of the generated thumbnail image (`.avif`), stored in `S3_BUCKET`. Only applies to videos. |
| `preview_path` | string | no | S3 key of the hover preview asset (stored in `S3_BUCKET`). For videos: 3–5 second clip (`.webm`). For image sets: typically the first image converted to a lightweight `.avif`. |
| `duration` | float | no | Video duration in seconds (e.g. `13.2`). Rounded to integer and stored in `videos.duration_seconds`. Only applies to videos. |
| `video_formats` | object (map) | no | **Videos only.** Map of resolution (in `"WxH"` format) → object with `storage_path` (S3 path in **S3_BUCKET**) and optionally `free_preview_path` (S3 path of the free preview clip, **paywalled videos only**). Each entry creates or updates a `video_formats` row. The highest resolution (by height) is served to the player. Example: `{"1920x1080": {"storage_path": "videos/u/1080p.webm", "free_preview_path": "videos/u/free_preview/1080p.webm"}}`. |
| `processed_files` | array of strings | no | **Image sets only.** Processed file paths in **S3_BUCKET**, one per original image in the same order as `files[]`. For videos this field is ignored — use `video_formats` instead. |
| `blurred_files` | array of strings | no | **Paywalled galleries only.** S3 keys of blurred `.avif` versions, one per image in the same order as `files[]`. Images at index < `unblurred_count` may be empty strings (left unblurred). Stored in `images.blurred_storage_path`. |

### Valid Status Values

| Value | Meaning |
|-------|---------|
| `"ready"` | Processing succeeded — content becomes visible to users |
| `"failed"` | Processing failed — content stays hidden |

### Responses

#### `200 OK`

```json
{ "ok": true }
```

#### `400 Bad Request`

```json
{ "error": "Invalid status. Must be 'ready' or 'failed'" }
```

#### `401 Unauthorized`

```json
{ "error": "Invalid or missing API key" }
```

#### `404 Not Found`

```json
{ "error": "Content not found" }
```
