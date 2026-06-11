# Pipeline API — fevid-V2

Internal HTTP endpoints used by the H264 + WebP processing pipeline to discover and update unprocessed content.

## Auth

| Endpoint | Auth |
|----------|------|
| `GET /api/pending-processing` | None |
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
  "status": "ready"
}
```

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
      
      if item.content_type == "image_set":
        webp = webp_encode(original, qualities=[80, 50])
        upload to S3_BUCKET / galleries/{content_id}/
    
    PATCH http://app:8080/api/content/{item.content_id}/status
      X-Api-Key: {S3_ACCESS_KEY}
      { "status": "ready" }
```
