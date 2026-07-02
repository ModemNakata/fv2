#!/usr/bin/env python3
"""
Cleanup script for fevid-V2.

Finds content with status = 'failed' in the database, deletes all related
S3 files from both buckets (orig + processed), and removes the DB rows.
Also detects stale S3 objects (files in buckets with no DB reference).

Usage:
    # Dry-run (default) — log what would be done, no mutations
    python3 scripts/cleanup.py

    # Actually delete failed content + stale S3 objects
    python3 scripts/cleanup.py --execute

    # Only run the stale-S3 check (skip failed-content cleanup)
    python3 scripts/cleanup.py --stale-only

    # Only run the failed-content cleanup (skip stale-S3 check)
    python3 scripts/cleanup.py --failed-only

    # Quick summary mode (less verbose)
    python3 scripts/cleanup.py --quiet

Dependencies (install with uv):
    uv pip install psycopg2-binary boto3 python-dotenv
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

try:
    import psycopg2
except ImportError:
    print("ERROR: psycopg2 is required. Install with: uv pip install psycopg2-binary")
    sys.exit(1)

try:
    import boto3
except ImportError:
    print("ERROR: boto3 is required. Install with: uv pip install boto3")
    sys.exit(1)


log = logging.getLogger("cleanup")
DRY_RUN = True


# ── logging ──────────────────────────────────────────────────────────────


class ColourFormatter(logging.Formatter):
    grey = "\x1b[38;20m"
    cyan = "\x1b[36m"
    yellow = "\x1b[33m"
    red = "\x1b[31;1m"
    bold_red = "\x1b[31;1m"
    green = "\x1b[32m"
    reset = "\x1b[0m"

    FORMATS = {
        logging.DEBUG: grey,
        logging.INFO: cyan,
        logging.WARNING: yellow,
        logging.ERROR: red,
        logging.CRITICAL: bold_red,
    }

    def format(self, record):
        colour = self.FORMATS.get(record.levelno, self.grey)
        formatter = logging.Formatter(
            f"%(asctime)s  {colour}%(levelname)-8s{self.reset}  %(message)s",
            datefmt="%H:%M:%S",
        )
        return formatter.format(record)


def setup_logging(quiet: bool = False) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(ColourFormatter())
    log.addHandler(handler)
    log.setLevel(logging.WARNING if quiet else logging.DEBUG)


# ── .env loading ─────────────────────────────────────────────────────────


def load_env() -> None:
    candidates = [
        Path(__file__).resolve().parent.parent / ".env",
        Path.cwd() / ".env",
    ]
    for env_path in candidates:
        if env_path.exists():
            try:
                from dotenv import load_dotenv

                load_dotenv(env_path, override=False)
                log.info("loaded .env from %s", env_path)
            except ImportError:
                log.warning("python-dotenv not installed, reading .env directly")
                for line in env_path.read_text().splitlines():
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, _, val = line.partition("=")
                    os.environ.setdefault(key.strip(), val.strip())
            return
    log.warning("no .env file found — relying on already-set environment variables")


# ── DB helpers ────────────────────────────────────────────────────────────


def get_db_connection():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        log.error("DATABASE_URL is not set in .env or environment")
        sys.exit(1)
    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    log.info(
        "connected to db — %s@%s/%s",
        conn.info.user,
        conn.info.host or "localhost",
        conn.info.dbname,
    )
    return conn


# ── S3 helpers ────────────────────────────────────────────────────────────


def build_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ["S3_ENDPOINT"],
        aws_access_key_id=os.environ["S3_ACCESS_KEY"],
        aws_secret_access_key=os.environ["S3_SECRET_KEY"],
        region_name=os.environ.get("S3_REGION", "us-east-1"),
    )


def list_all_objects(s3, bucket: str, prefix: str = "") -> set[str]:
    """Return a set of all object keys in a bucket (handles pagination)."""
    keys: set[str] = set()
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            keys.add(obj["Key"])
    return keys


def delete_s3_object(s3, bucket: str, key: str, reason: str = "") -> None:
    """Delete a single S3 object (respects DRY_RUN)."""
    if DRY_RUN:
        tag = "[DRY-RUN]"
    else:
        tag = "[DELETE]"
        try:
            s3.delete_object(Bucket=bucket, Key=key)
        except Exception as e:
            log.error("  %s failed to delete s3://%s/%s — %s", tag, bucket, key, e)
            return
    suffix = f"  ({reason})" if reason else ""
    log.info("  %s s3://%s/%s%s", tag, bucket, key, suffix)


def delete_s3_objects(s3, bucket: str, keys: list[str], reason: str = "") -> None:
    """Delete a list of S3 objects in batches of 1000 (respects DRY_RUN)."""
    if not keys:
        return
    # Deduplicate
    unique = list(dict.fromkeys(keys))
    batch_size = 1000
    for i in range(0, len(unique), batch_size):
        batch = unique[i : i + batch_size]
        if DRY_RUN:
            for k in batch:
                log.info("  [DRY-RUN] s3://%s/%s%s", bucket, k, f"  ({reason})" if reason else "")
        else:
            try:
                s3.delete_objects(
                    Bucket=bucket,
                    Delete={"Objects": [{"Key": k} for k in batch], "Quiet": True},
                )
            except Exception as e:
                log.error("  batch delete error in %s: %s", bucket, e)
                # Fall back to individual deletes
                for k in batch:
                    delete_s3_object(s3, bucket, k, reason)
                continue
            for k in batch:
                log.info("  [DELETE] s3://%s/%s%s", bucket, k, f"  ({reason})" if reason else "")


# ── Phase 1: Clean up failed content ─────────────────────────────────────


def collect_failed_content(conn) -> list[dict]:
    """Return list of content_items with status = 'failed'."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, uploader_id, type, title, thumbnail_url, status, slug "
            "FROM content_items WHERE status = 'failed' "
            "ORDER BY created_at DESC"
        )
        rows = cur.fetchall()
    result = []
    for r in rows:
        result.append(
            {
                "id": r[0],
                "uploader_id": r[1],
                "type": r[2],
                "title": r[3],
                "thumbnail_url": r[4],
                "status": r[5],
                "slug": r[6],
            }
        )
    return result


def collect_s3_keys_for_content(conn, content_id: uuid.UUID) -> tuple[list[str], list[str]]:
    """
    Collect all S3 keys from the database for a given content item.
    Returns (orig_keys, processed_keys).
    Mirrors the logic in src/pipeline.rs cancel_content().
    """
    orig_keys: list[str] = []
    processed_keys: list[str] = []

    # content_items.thumbnail_url → processed bucket
    with conn.cursor() as cur:
        cur.execute("SELECT thumbnail_url FROM content_items WHERE id = %s", (content_id,))
        row = cur.fetchone()
        if row and row[0]:
            processed_keys.append(row[0])

    # Check if it's a video or image_set by trying both tables
    # videos
    with conn.cursor() as cur:
        cur.execute("SELECT preview_path FROM videos WHERE content_id = %s", (content_id,))
        row = cur.fetchone()
        if row and row[0]:
            processed_keys.append(row[0])

    # video_formats
    with conn.cursor() as cur:
        cur.execute(
            "SELECT orig_storage_path, storage_path, free_preview_path "
            "FROM video_formats WHERE video_id = %s",
            (content_id,),
        )
        for row in cur.fetchall():
            if row[0]:
                orig_keys.append(row[0])
            if row[1]:
                processed_keys.append(row[1])
            if row[2]:
                processed_keys.append(row[2])

    # image_sets
    with conn.cursor() as cur:
        cur.execute("SELECT preview_path FROM image_sets WHERE content_id = %s", (content_id,))
        row = cur.fetchone()
        if row and row[0]:
            processed_keys.append(row[0])

    # images
    with conn.cursor() as cur:
        cur.execute(
            "SELECT orig_storage_path, storage_path, blurred_storage_path "
            "FROM images WHERE image_set_id = %s",
            (content_id,),
        )
        for row in cur.fetchall():
            if row[0]:
                orig_keys.append(row[0])
            if row[1]:
                processed_keys.append(row[1])
            if row[2]:
                processed_keys.append(row[2])

    return orig_keys, processed_keys


def run_failed_content_cleanup(conn, s3, processed_bucket: str, orig_bucket: str) -> None:
    """Phase 1: find failed content, delete S3 files, delete DB rows."""
    log.info("")
    log.info("=" * 72)
    log.info("PHASE 1: Failed Content Cleanup")
    log.info("=" * 72)

    items = collect_failed_content(conn)
    if not items:
        log.info("no failed content found — nothing to do")
        return

    log.info("found %d content item(s) with status = 'failed'", len(items))
    log.info("")

    total_orig = 0
    total_processed = 0
    deleted_count = 0

    for item in items:
        cid = item["id"]
        ctype = item["type"]
        title = (item["title"] or "")[:80]
        log.info("─" * 72)
        log.info("content: %s  [%s]  title=%s  slug=%s", cid, ctype, title, item.get("slug"))

        orig_keys, processed_keys = collect_s3_keys_for_content(conn, cid)

        if orig_keys:
            log.info("  orig bucket keys (%d):", len(orig_keys))
            for k in orig_keys:
                log.info("    %s", k)

        if processed_keys:
            log.info("  processed bucket keys (%d):", len(processed_keys))
            for k in processed_keys:
                log.info("    %s", k)

        if not orig_keys and not processed_keys:
            log.info("  (no S3 keys found for this content)")

        # Delete S3 objects
        if orig_keys:
            delete_s3_objects(s3, orig_bucket, orig_keys, "failed content cleanup")
        if processed_keys:
            delete_s3_objects(s3, processed_bucket, processed_keys, "failed content cleanup")

        total_orig += len(orig_keys)
        total_processed += len(processed_keys)

        # Delete DB row
        if DRY_RUN:
            log.info("  [DRY-RUN] DELETE FROM content_items WHERE id = %s", cid)
        else:
            try:
                with conn.cursor() as cur:
                    # Cascading delete handles videos, video_formats, image_sets,
                    # images, user_favorites, user_purchases, transactions
                    cur.execute("DELETE FROM content_items WHERE id = %s", (cid,))
                log.info("  [DELETE] content_items row id=%s", cid)
            except Exception as e:
                log.error("  failed to delete content %s: %s", cid, e)
                continue

        deleted_count += 1

    if not DRY_RUN:
        conn.commit()
        log.info("")
        log.info("committed %d content deletions to database", deleted_count)
    else:
        log.info("")
        log.info("dry-run — no changes committed (use --execute to apply)")

    log.info("")
    log.info(
        "Phase 1 summary: %d content items processed, "
        "%d orig keys, %d processed keys",
        len(items),
        total_orig,
        total_processed,
    )


# ── Phase 2: Stale S3 content ─────────────────────────────────────────────


def collect_all_db_s3_keys(conn) -> tuple[set[str], set[str]]:
    """
    Collect ALL S3 keys referenced in the database.
    Returns (orig_keys_set, processed_keys_set).
    """
    orig: set[str] = set()
    processed: set[str] = set()

    with conn.cursor() as cur:
        # content_items.thumbnail_url → processed
        cur.execute("SELECT thumbnail_url FROM content_items WHERE thumbnail_url IS NOT NULL")
        for row in cur.fetchall():
            processed.add(row[0])

        # videos.preview_path → processed
        cur.execute("SELECT preview_path FROM videos WHERE preview_path IS NOT NULL")
        for row in cur.fetchall():
            processed.add(row[0])

        # video_formats columns
        cur.execute(
            "SELECT orig_storage_path FROM video_formats WHERE orig_storage_path != ''"
        )
        for row in cur.fetchall():
            orig.add(row[0])
        cur.execute("SELECT storage_path FROM video_formats WHERE storage_path IS NOT NULL")
        for row in cur.fetchall():
            processed.add(row[0])
        cur.execute(
            "SELECT free_preview_path FROM video_formats WHERE free_preview_path IS NOT NULL"
        )
        for row in cur.fetchall():
            processed.add(row[0])

        # image_sets.preview_path → processed
        cur.execute("SELECT preview_path FROM image_sets WHERE preview_path IS NOT NULL")
        for row in cur.fetchall():
            processed.add(row[0])

        # images columns
        cur.execute("SELECT orig_storage_path FROM images WHERE orig_storage_path != ''")
        for row in cur.fetchall():
            orig.add(row[0])
        cur.execute("SELECT storage_path FROM images WHERE storage_path IS NOT NULL")
        for row in cur.fetchall():
            processed.add(row[0])
        cur.execute(
            "SELECT blurred_storage_path FROM images WHERE blurred_storage_path IS NOT NULL"
        )
        for row in cur.fetchall():
            processed.add(row[0])

    return orig, processed


def run_stale_s3_cleanup(conn, s3, processed_bucket: str, orig_bucket: str) -> None:
    """Phase 2: find stale S3 objects not referenced in DB."""
    log.info("")
    log.info("=" * 72)
    log.info("PHASE 2: Stale S3 Content Check")
    log.info("=" * 72)

    log.info("listing all objects in processed bucket (s3://%s/) ...", processed_bucket)
    all_processed_keys = list_all_objects(s3, processed_bucket)
    log.info("  found %d object(s)", len(all_processed_keys))

    log.info("listing all objects in orig bucket (s3://%s/) ...", orig_bucket)
    all_orig_keys = list_all_objects(s3, orig_bucket)
    log.info("  found %d object(s)", len(all_orig_keys))

    log.info("collecting all S3 keys referenced in database ...")
    db_orig_keys, db_processed_keys = collect_all_db_s3_keys(conn)
    log.info("  db references: %d orig keys, %d processed keys", len(db_orig_keys), len(db_processed_keys))

    stale_processed = all_processed_keys - db_processed_keys
    stale_orig = all_orig_keys - db_orig_keys

    # Filter out empty keys from stale if any
    stale_processed.discard("")
    stale_orig.discard("")

    log.info("")
    log.info("─" * 72)
    log.info("Stale objects in processed bucket (s3://%s/): %d", processed_bucket, len(stale_processed))
    if stale_processed:
        log.info("  listing up to 50 stale keys:")
        for i, k in enumerate(sorted(stale_processed)):
            if i >= 50:
                log.info("  ... and %d more", len(stale_processed) - 50)
                break
            log.info("    %s", k)

        delete_s3_objects(s3, processed_bucket, list(stale_processed), "stale s3 (processed)")
    else:
        log.info("  (none)")

    log.info("")
    log.info("─" * 72)
    log.info("Stale objects in orig bucket (s3://%s/): %d", orig_bucket, len(stale_orig))
    if stale_orig:
        log.info("  listing up to 50 stale keys:")
        for i, k in enumerate(sorted(stale_orig)):
            if i >= 50:
                log.info("  ... and %d more", len(stale_orig) - 50)
                break
            log.info("    %s", k)

        delete_s3_objects(s3, orig_bucket, list(stale_orig), "stale s3 (orig)")
    else:
        log.info("  (none)")

    if not DRY_RUN:
        log.info("")
        log.info("stale S3 objects deleted (no DB changes needed)")
    else:
        log.info("")
        log.info("dry-run — no S3 objects deleted (use --execute to apply)")

    log.info("")
    log.info(
        "Phase 2 summary: %d processed stale, %d orig stale",
        len(stale_processed),
        len(stale_orig),
    )


# ── Main ──────────────────────────────────────────────────────────────────


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Cleanup failed content and stale S3 objects for fevid-V2.",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually delete S3 objects and database rows (default: dry-run)",
    )
    parser.add_argument(
        "--failed-only",
        action="store_true",
        help="Only run Phase 1 (failed content cleanup), skip stale S3 check",
    )
    parser.add_argument(
        "--stale-only",
        action="store_true",
        help="Only run Phase 2 (stale S3 cleanup), skip failed content cleanup",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Less verbose output — only warnings and above",
    )
    return parser.parse_args(argv)


def main() -> None:
    args = parse_args()
    global DRY_RUN
    DRY_RUN = not args.execute

    setup_logging(quiet=args.quiet)
    load_env()

    run_label = "DRY-RUN" if DRY_RUN else "EXECUTE"
    log.info("─" * 72)
    log.info("fevid-V2 Cleanup — mode: %s", run_label)
    log.info("─" * 72)

    processed_bucket = os.environ.get("S3_BUCKET")
    orig_bucket = os.environ.get("S3_BUCKET_ORIGIN")

    if not processed_bucket or not orig_bucket:
        log.error(
            "S3_BUCKET and S3_BUCKET_ORIGIN must be set in .env"
        )
        sys.exit(1)

    log.info("processed bucket: %s", processed_bucket)
    log.info("orig bucket:      %s", orig_bucket)

    # Connect
    conn = get_db_connection()
    s3 = build_s3_client()

    try:
        # Phase 1
        if not args.stale_only:
            run_failed_content_cleanup(conn, s3, processed_bucket, orig_bucket)

        # Phase 2
        if not args.failed_only:
            run_stale_s3_cleanup(conn, s3, processed_bucket, orig_bucket)

        if DRY_RUN:
            log.info("")
            log.info("=" * 72)
            log.info("DRY-RUN COMPLETE — no data was modified")
            log.info("Re-run with --execute to apply all changes")
            log.info("=" * 72)
        else:
            log.info("")
            log.info("=" * 72)
            log.info("CLEANUP COMPLETE")
            log.info("=" * 72)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
