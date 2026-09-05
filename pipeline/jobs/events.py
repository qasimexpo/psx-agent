"""Corporate actions and news.

Replaces the previous scraper, which returned nothing because the PSX payouts
and announcements pages render their tables in the browser. This job uses the
JSON and form endpoints the portal's own front end calls, so the dividend
calendar has real rows again.
"""

from __future__ import annotations

import logging
from datetime import date, datetime

from sqlalchemy import select

from pipeline import db, news, psx
from pipeline.config import PKT

logger = logging.getLogger("smartsarmaya.jobs.events")


def _parse_date(value: str) -> date | None:
    value = (value or "").strip()
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _halal_symbols() -> set[str]:
    with db.session_scope() as session:
        rows = session.execute(
            select(db.Stock.symbol).where(db.Stock.is_kmi.is_(True))
        ).all()
    return {row[0] for row in rows}


def run() -> dict[str, int]:
    db.init_db()
    now = datetime.now(PKT)
    logger.info("Events refresh starting at %s PKT.", now.strftime("%Y-%m-%d %H:%M"))

    halal = _halal_symbols()
    counts = {"events": 0, "payouts": 0, "news": 0}

    # Board meetings, AGMs and EOGMs
    try:
        rows = []
        for item in psx.fetch_calendar(days_back=7, days_forward=75):
            event_date = _parse_date(item["date"])
            if event_date is None:
                continue
            rows.append(
                {
                    "symbol": item["symbol"],
                    "company": item["company"][:250],
                    "event_type": item["event_type"][:32],
                    "event_date": event_date,
                    "event_time": item["time"][:16],
                    "city": item["city"][:64],
                    "period_end": item["period_end"][:32],
                    "is_kmi": item["symbol"] in halal,
                    "updated_at": now,
                }
            )
        counts["events"] = db.replace_corporate_events(rows)
        logger.info("Stored %s corporate events.", counts["events"])
    except psx.PsxUnavailableError:
        logger.exception("Corporate calendar unavailable; keeping previous rows.")

    # Dividends and book closure windows
    try:
        rows = []
        for item in psx.fetch_upcoming_payouts(days_forward=75, days_back=7):
            rows.append(
                {
                    "symbol": item["symbol"],
                    "company": item["company"][:250],
                    "sector_name": item["sector_name"][:120],
                    "payout": item["payout"][:120],
                    "announced_on": _parse_date(item["announced_on"]),
                    "book_closure_from": _parse_date(item["book_closure_from"]),
                    "book_closure_to": _parse_date(item["book_closure_to"]),
                    "is_kmi": item["symbol"] in halal,
                    "updated_at": now,
                }
            )
        counts["payouts"] = db.replace_payouts(rows)
        logger.info("Stored %s upcoming payouts.", counts["payouts"])
    except psx.PsxUnavailableError:
        logger.exception("Payouts unavailable; keeping previous rows.")

    # Headlines
    try:
        items = news.fetch_all(limit_per_region=8)
        rows = [
            {
                "region": item["region"],
                "title": item["title"],
                "snippet": item["snippet"],
                "source": item["source"],
                "link": item["link"],
                "published_at": item["published_at"],
                "updated_at": now,
            }
            for item in items
        ]
        counts["news"] = db.replace_news(rows)
        logger.info("Stored %s headlines.", counts["news"])
    except Exception:  # noqa: BLE001 - news must never fail the whole job
        logger.exception("News refresh failed; keeping previous rows.")

    return counts
