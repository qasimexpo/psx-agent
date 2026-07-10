#!/usr/bin/env python3
"""
Background updater for Neon DB — run via cron (tickers/news every 30m, top picks daily).
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

from database import (
    init_db,
    replace_news_and_events,
    upsert_ticker_rows,
    upsert_top_picks,
)
from fetchers import (
    fetch_dividend_calendar,
    fetch_global_finance_news,
    fetch_kse100_ticker_rows_for_db,
    fetch_pakistan_news,
)
from service import generate_top_picks_for_cron

logger = logging.getLogger("smartsarmaya.cron")
PKT = ZoneInfo("Asia/Karachi")


def _setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )


def _news_records() -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    for item in fetch_pakistan_news(limit=5):
        records.append(
            {
                "type": "news",
                "title_or_symbol": item.get("title", ""),
                "description": json.dumps(
                    {
                        "snippet": item.get("snippet", ""),
                        "source": item.get("source", ""),
                        "region": "pakistan",
                    }
                ),
                "link_or_date": item.get("link", ""),
            }
        )
    for item in fetch_global_finance_news(limit=5):
        records.append(
            {
                "type": "news",
                "title_or_symbol": item.get("title", ""),
                "description": json.dumps(
                    {
                        "snippet": item.get("snippet", ""),
                        "source": item.get("source", ""),
                        "region": "global",
                    }
                ),
                "link_or_date": item.get("link", ""),
            }
        )
    return records


def _event_records() -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    for item in fetch_dividend_calendar():
        event_type = str(item.get("event_type", "")).strip().lower()
        if "board" in event_type:
            db_type = "board_meeting"
        else:
            db_type = "dividend"
        records.append(
            {
                "type": db_type,
                "title_or_symbol": str(item.get("symbol", "")).strip().upper(),
                "description": str(item.get("details", "")).strip(),
                "link_or_date": str(item.get("date", "")).strip(),
            }
        )
    return records


def update_tickers_and_news() -> None:
    """Fetch tickers + news/events and UPSERT into Neon DB."""
    logger.info("Starting tickers and news/events update at %s PKT.", datetime.now(PKT))
    init_db()

    ticker_rows = fetch_kse100_ticker_rows_for_db()
    ticker_count = upsert_ticker_rows(ticker_rows)
    logger.info("Upserted %s ticker rows.", ticker_count)

    news_records = _news_records()
    event_records = _event_records()
    combined = news_records + event_records
    event_count = replace_news_and_events(combined)
    logger.info("Replaced %s news/event rows.", event_count)


def update_top_picks() -> None:
    """Generate fresh top picks via Groq and UPSERT into Neon DB."""
    logger.info("Starting daily top picks update at %s PKT.", datetime.now(PKT))
    init_db()

    result = generate_top_picks_for_cron()
    report_html = result.get("report_html", "")
    for category, picks_key in (
        ("daily", "daily_picks"),
        ("monthly", "monthly_picks"),
        ("yearly", "yearly_picks"),
    ):
        payload = {
            "picks": result.get(picks_key, []),
            "report_html": report_html,
        }
        upsert_top_picks(category, payload)
        logger.info("Upserted top picks for category=%s (%s picks).", category, len(payload["picks"]))


def main(argv: list[str] | None = None) -> int:
    _setup_logging()
    parser = argparse.ArgumentParser(description="SmartSarmaya Neon DB background updater")
    parser.add_argument(
        "job",
        choices=("tickers", "top_picks"),
        help="tickers = 30-min job; top_picks = daily job",
    )
    args = parser.parse_args(argv)

    try:
        if args.job == "tickers":
            update_tickers_and_news()
        else:
            update_top_picks()
    except Exception:
        logger.exception("Cron job failed: %s", args.job)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
