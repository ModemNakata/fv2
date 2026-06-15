# S3 Integrity Check & Cleanup Script

## Purpose

A Python script that reconciles the database and S3 storage, finding:

1. **Orphaned S3 files** — files in S3 that have no corresponding database record (left behind when processing is cancelled mid-upload, or after partial pipeline failures).
2. **Missing S3 files** — database records that reference storage paths that no longer exist in S3 (indicating data loss or manual S3 cleanup).

## Design

### Configuration

Read from environment variables or a `.env` file:

| Variable | Description |
|----------|-------------|
| `S3_ENDPOINT` | S3-compatible endpoint URL |
| `S3_REGION` | Region (e.g. `us-east-1`) |
| `S3_ACCESS_KEY` | Access key ID |
| `S3_SECRET_KEY` | Secret access key |
| `S3_BUCKET` | Bucket name |
| `DATABASE_URL` | Postgres connection string |

### Modes

#### `check` (default, read-only)

1. Scan all S3 paths under the bucket prefix (e.g. `videos/`, `galleries/`, `thumbnails/`).
2. Query the database for all `content_items`, `videos`, `video_formats`, `image_sets`, `images` records.
3. Cross-reference:
   - **Orphans**: S3 keys whose content UUID does not match any `content_items.id` in the database.
   - **Missing**: Database storage paths (`orig_storage_path`, `storage_path`, `thumbnail_url`) whose S3 key does not exist.
4. Print a summary report:
   ```
   Integrity Report — 2026-06-15 14:30 UTC
   ========================================
   S3 objects scanned:      1,247
   DB records checked:        832

   Orphaned S3 files:          12      2.3 MB
   Missing DB paths:            3
   OK (matched):            1,232
   ```

#### `cleanup` (destructive, requires `--apply`)

Same scan, then:

1. **Delete orphaned S3 files** — remove S3 objects that have no DB record (these are safe to delete since no application code references them).
2. **Report missing DB paths** — cannot fix these automatically (data loss), but flag them for manual review.

### Dry-run default

Always run in dry-run mode unless `--apply` is passed. Show what would be deleted without actually deleting.

## Example Usage

```bash
# Read-only check
python scripts/s3-integrity-check.py check

# See what cleanup would do
python scripts/s3-integrity-check.py cleanup

# Actually delete orphans
python scripts/s3-integrity-check.py cleanup --apply

# Only scan a specific content type
python scripts/s3-integrity-check.py check --type video
```

## Implementation Notes

- Use `boto3` (or `s3fs`) for S3 access and `asyncpg`/`psycopg2` for Postgres.
- Paginate S3 list results (max 1000 keys per response).
- Paginate DB queries for large datasets.
- Log all deletions to a file (`cleanup-{timestamp}.log`).
- Use `tqdm` for progress bars during long scans.
- Handle the case where the same content UUID appears in multiple S3 paths (video master + variants + thumbnails).
