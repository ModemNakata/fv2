#!/usr/bin/env python3
"""
Backfill slug column for content_items where slug is NULL.

Loads DATABASE_URL from .env (if python-dotenv is installed) or from
environment variable.  Verbose logging shows every row processed.

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


# ── logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("backfill")


# ── helpers ────────────────────────────────────────────────────────────────

def get_db_url() -> str:
    """Return DATABASE_URL, trying .env first if dotenv is available."""
    try:
        import dotenv
        # Search for .env in: project root (script's parent), then CWD
        candidates = [
            Path(__file__).resolve().parent.parent / ".env",   # scripts/../.env
            Path.cwd() / ".env",                               # working directory
            Path.home() / "Desktop/project/fevid-V2/.env",     # known absolute
        ]
        for env_path in candidates:
            if env_path.exists():
                dotenv.load_dotenv(env_path, override=False)
                log.info("loaded .env from %s", env_path)
                break
        else:
            log.info("no .env found at %s", [str(p) for p in candidates])
    except ImportError:
        log.info("python-dotenv not installed, relying on DATABASE_URL env var")

    url = os.environ.get("DATABASE_URL")
    if not url:
        log.error("DATABASE_URL is not set (checked env and .env)")
        sys.exit(1)
    return url


def make_unique_slug(existing: set[str], title: str | None) -> str:
    """Build a unique slug from *title*, deduplicating against *existing*."""
    base = _slugify(title or "", max_length=240) or "untitled"

    for i in range(10000):
        slug = base if i == 0 else f"{base}-{i}"
        if slug not in existing:
            return slug

    import secrets
    return f"{base}-{secrets.token_hex(4)}"


# ── main ───────────────────────────────────────────────────────────────────

def main() -> None:
    db_url = get_db_url()
    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    log.info("connected to %s@%s/%s", conn.info.user, conn.info.host or "localhost", conn.info.dbname)

    # 1. Fetch existing slugs (for dedup)
    existing: set[str] = set()
    with conn.cursor() as cur:
        cur.execute("SELECT slug FROM content_items WHERE slug IS NOT NULL")
        existing.update(row[0] for row in cur.fetchall() if row[0])

    log.info("loaded %d existing slug(s)", len(existing))

    # 2. Fetch rows that need a slug
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, title FROM content_items WHERE slug IS NULL ORDER BY created_at"
        )
        rows = list(cur.fetchall())

    if not rows:
        log.info("nothing to do — all content_items already have a slug")
        conn.close()
        return

    log.info("processing %d content_items without a slug", len(rows))
    log.info("─" * 72)

    updated = errors = 0
    for idx, (content_id, title) in enumerate(rows, 1):
        try:
            slug = make_unique_slug(existing, title)
            existing.add(slug)
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE content_items SET slug = %s WHERE id = %s",
                    (slug, content_id),
                )
            log.info("  [%3d/%d] %s  →  %s", idx, len(rows), content_id, slug)
            updated += 1
        except Exception as exc:
            log.error("  [%3d/%d] %s  FAILED  %s", idx, len(rows), content_id, exc)
            errors += 1

    conn.commit()
    log.info("─" * 72)
    log.info("committed — %d updated, %d error(s)", updated, errors)

    # Final verification
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
