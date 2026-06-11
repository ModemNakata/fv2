# Pipeline API

Internal HTTP endpoints used by the H264 + WebP processing pipeline to discover and update unprocessed content.

## Auth

| Endpoint | Auth |
|----------|------|
| `GET /api/pending-processing` | None |
| `GET /api/content/{id}` | None |
| `PATCH /api/content/{id}/status` | `X-Api-Key` header must match `S3_ACCESS_KEY` from `.env` |

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
Pipeline encodes H264 + WebP, uploads to S3_BUCKET
         │
         ▼
Pipeline calls PATCH /api/content/{id}/status
         │
         ├── status="ready"   → content available to users
         └── status="failed"  → content marked as failed
```

---

## `GET /api/pending-processing`

Returns all content items with `status = processing` (upload complete, awaiting encoding).

### Response `200 OK`

```json
[
  {
    "content_id": "550e8400-e29b-41d4-a716-446655440000",
    "content_type": "video",
    "title": "My Great Video",
    "files": [
      {
        "path": "videos/a1b2c3d4-e5f6-7890-abcd-ef1234567890.mp4",
        "original_name": "my_video.mp4"
      }
    ]
  },
  {
    "content_id": "660e8400-e29b-41d4-a716-446655440001",
    "content_type": "image_set",
    "title": "Photo Album",
    "files": [
      {
        "path": "galleries/x1y2z3d4-e5f6-7890-abcd-ef1234567890.jpg",
        "original_name": "photo1.jpg"
      },
      {
        "path": "galleries/a2b3c4d5-e6f7-8901-bcde-f12345678901.png",
        "original_name": "photo2.png"
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
| `files` | array | One file for video, potentially multiple for image_set |
| `files[].path` | string | Key in **S3_ORIG_BUCKET** (the upload bucket), suitable for `GetObject` |
| `files[].original_name` | string | Original filename as uploaded by user |

### Notes

- `path` values are relative to `S3_ORIG_BUCKET` — if you have endpoint `https://s3.example.com/origin-bucket`, the full URL would be `https://s3.example.com/origin-bucket/videos/uuid.mp4`
- Videos always return exactly one file (the original upload)
- Image sets return all images ordered by `sort_order`

---

## `GET /api/content/{id}`

Returns a single content item by ID (any status). Useful for the pipeline's `--uuid` direct mode to resolve the original file mapping without needing `--file`.

### Response `200 OK`

```json
{
  "content_id": "13e535ad-3020-4b0c-be99-eadf99a65620",
  "content_type": "video",
  "title": "123",
  "files": [
    {
      "path": "videos/e31cca56-3c62-4f80-bff9-edf62cfae12d.mp4",
      "original_name": ":3.mp4"
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
| `X-Api-Key` | `S3_ACCESS_KEY` from `.env` (required) |
| `Content-Type` | `application/json` |

### Request Body

```json
{
  "status": "ready",
  "thumbnail_url": "videos/550e8400-e29b-41d4-a716-446655440000/thumbnail.jpg",
  "preview_path": "videos/550e8400-e29b-41d4-a716-446655440000/preview.webm"
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | yes | `"ready"` or `"failed"` |
| `thumbnail_url` | string | no | S3 key of the generated 1280×720 thumbnail image (stored in `S3_BUCKET`). Only applies to videos. |
| `preview_path` | string | no | S3 key of the 3–5 second hover preview clip (stored in `S3_BUCKET`). Only applies to videos. |

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

---

## Example Pipeline Loop (pseudo-code)

```
loop:
  items = GET http://app:8080/api/pending-processing
  
  for item in items:
    for file in item.files:
      original = download from S3_ORIG_BUCKET / file.path
      
      if item.content_type == "video":
        encoded = h264_encode(original, resolutions=[1080p, 720p, 480p])
        upload to S3_BUCKET / videos/{content_id}/
        
        # Generate thumbnail + preview clip
        thumbnail = ffmpeg_thumbnail(original, size=1280x720, seek=5s)
        upload thumbnail to S3_BUCKET / videos/{content_id}/thumbnail.jpg
        
        preview = ffmpeg_clip(original, start=0s, duration=3s, scale=640x360)
        upload preview to S3_BUCKET / videos/{content_id}/preview.webm
      
      if item.content_type == "image_set":
        webp = webp_encode(original, qualities=[80, 50])
        upload to S3_BUCKET / galleries/{content_id}/
    
    PATCH http://app:8080/api/content/{item.content_id}/status
      X-Api-Key: {S3_ACCESS_KEY}
      {
        "status": "ready",
        "thumbnail_url": "videos/{content_id}/thumbnail.jpg",
        "preview_path": "videos/{content_id}/preview.webm"
      }
```
