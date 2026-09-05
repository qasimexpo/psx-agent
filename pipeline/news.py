"""Market news from free Google News RSS feeds."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any

import feedparser

logger = logging.getLogger("smartsarmaya.news")

FEEDS: dict[str, str] = {
    "pakistan": (
        "https://news.google.com/rss/search?"
        "q=Pakistan+Stock+Exchange+OR+KSE-100+OR+State+Bank+of+Pakistan+OR+Pakistan+economy"
        "&hl=en-PK&gl=PK&ceid=PK:en"
    ),
    "global": (
        "https://news.google.com/rss/search?"
        "q=global+markets+OR+Federal+Reserve+OR+oil+prices+OR+emerging+markets"
        "&hl=en-US&gl=US&ceid=US:en"
    ),
}

_TAG_RE = re.compile(r"<[^>]+>")


def _clean(text: str) -> str:
    return _TAG_RE.sub("", text or "").replace("&nbsp;", " ").strip()


def _source_of(entry: Any, title: str) -> str:
    source = getattr(entry, "source", None)
    if source is not None:
        title_attr = getattr(source, "title", None)
        if title_attr:
            return str(title_attr).strip()
    # Google News titles end with " - Publisher".
    if " - " in title:
        return title.rsplit(" - ", 1)[-1].strip()
    return "Google News"


def _published(entry: Any) -> datetime | None:
    parsed = getattr(entry, "published_parsed", None)
    if not parsed:
        return None
    try:
        return datetime(*parsed[:6], tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def fetch(region: str, limit: int = 8) -> list[dict[str, Any]]:
    url = FEEDS.get(region)
    if not url:
        return []

    feed = feedparser.parse(url)
    items: list[dict[str, Any]] = []
    seen: set[str] = set()

    for entry in feed.entries:
        raw_title = _clean(getattr(entry, "title", ""))
        link = (getattr(entry, "link", "") or "").strip()
        if not raw_title or not link:
            continue

        source = _source_of(entry, raw_title)
        title = raw_title
        if title.endswith(f" - {source}"):
            title = title[: -len(f" - {source}")].strip()

        fingerprint = title.lower()[:90]
        if fingerprint in seen:
            continue
        seen.add(fingerprint)

        snippet = _clean(getattr(entry, "summary", ""))[:400] or title
        items.append(
            {
                "region": region,
                "title": title[:500],
                "snippet": snippet,
                "source": source[:120],
                "link": link,
                "published_at": _published(entry),
            }
        )
        if len(items) >= limit:
            break

    logger.info("Fetched %s %s headlines.", len(items), region)
    return items


def fetch_all(limit_per_region: int = 8) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for region in FEEDS:
        try:
            rows.extend(fetch(region, limit_per_region))
        except Exception:  # noqa: BLE001 - one bad feed should not stop the job
            logger.exception("Failed to fetch %s news.", region)
    return rows


def format_for_prompt(items: list[dict[str, Any]], limit: int = 10) -> str:
    if not items:
        return "No recent headlines available."
    lines = []
    for item in items[:limit]:
        region = item.get("region", "").upper()[:2]
        lines.append(f"- [{region}] {item['title']} ({item.get('source', '')})")
    return "\n".join(lines)
