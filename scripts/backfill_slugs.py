#!/usr/bin/env python3
"""
Backfill slug column for content_items where slug is NULL.

Uses title-similarity (slugify(title) == base) for suffix assignment,
matching the Rust logic in src/slug.rs.

Usage:
    pip install psycopg2-binary python-slugify
    python3 scripts/backfill_slugs.py
"""

import logging
import os
import re
import sys
from pathlib import Path

try:
    import psycopg2
except ImportError:
    print("ERROR: psycopg2 is required. Install with: pip install psycopg2-binary")
    sys.exit(1)

try:
    from slugify import slugify as _slugify
except ImportError:
    print("NOTE: python-slugify not found — using a simple fallback slugger.")
    import unicodedata

    def _slugify(text: str, **kwargs) -> str:
        text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
        text = re.sub(r"[^a-zA-Z0-9\s-]", "", text).lower().strip()
        text = re.sub(r"[\s-]+", "-", text)
        text = text.strip("-")
        return text or "untitled"


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("backfill")


def slug_base(title: str | None) -> str:
    base = _slugify(title or "")
    return base or "untitled"


def get_db_url() -> str:
    try:
        import dotenv

        candidates = [
            Path(__file__).resolve().parent.parent / ".env",
            Path.cwd() / ".env",
        ]
        for env_path in candidates:
            if env_path.exists():
                dotenv.load_dotenv(env_path, override=False)
                log.info("loaded .env from %s", env_path)
                break
    except ImportError:
        pass

    url = os.environ.get("DATABASE_URL")
    if not url:
        log.error("DATABASE_URL is not set")
        sys.exit(1)
    return url


def make_unique_slug(
    titles_by_base: dict[str, list[str]],
    assigned_slugs: set[str],
    title: str | None,
) -> str:
    """Match Rust unique_slug: suffix from title-similarity, not slug collisions."""
    base = slug_base(title)
    peer_count = len(titles_by_base.get(base, []))

    if peer_count == 0 and base not in assigned_slugs:
        return base

    start = 2 if peer_count == 0 else peer_count + 1
    for i in range(start, 10_000):
        candidate = f"{base}-{i}"
        if candidate not in assigned_slugs:
            return candidate

    import secrets

    return f"{base}-{secrets.token_hex(4)}"


def main() -> None:
    db_url = get_db_url()
    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    log.info("connected to %s@%s/%s", conn.info.user, conn.info.host or "localhost", conn.info.dbname)

    with conn.cursor() as cur:
        cur.execute("SELECT id, title, slug FROM content_items ORDER BY created_at")
        all_rows = cur.fetchall()

    assigned_slugs: set[str] = {row[2] for row in all_rows if row[2]}
    titles_by_base: dict[str, list[str]] = {}

    for _id, title, slug in all_rows:
        if slug:
            base = slug_base(title)
            titles_by_base.setdefault(base, []).append(title or "")

    to_backfill = [(row[0], row[1]) for row in all_rows if not row[2]]

    if not to_backfill:
        log.info("nothing to do — all content_items already have a slug")
        conn.close()
        return

    log.info("processing %d content_items without a slug", len(to_backfill))
    log.info("─" * 72)

    updated = errors = 0
    for idx, (content_id, title) in enumerate(to_backfill, 1):
        try:
            slug = make_unique_slug(titles_by_base, assigned_slugs, title)
            assigned_slugs.add(slug)
            base = slug_base(title)
            titles_by_base.setdefault(base, []).append(title or "")

            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE content_items SET slug = %s WHERE id = %s",
                    (slug, content_id),
                )
            log.info("  [%3d/%d] %s  →  %s", idx, len(to_backfill), content_id, slug)
            updated += 1
        except Exception as exc:
            log.error("  [%3d/%d] %s  FAILED  %s", idx, len(to_backfill), content_id, exc)
            errors += 1

    conn.commit()
    log.info("─" * 72)
    log.info("committed — %d updated, %d error(s)", updated, errors)

    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM content_items WHERE slug IS NULL")
        remaining = cur.fetchone()[0]
    if remaining:
        log.warning("%d row(s) still have NULL slug", remaining)
    else:
        log.info("all content_items now have a slug ✓")

    conn.close()


if __name__ == "__main__":
    main()
