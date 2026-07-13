#!/usr/bin/env python3
"""
Background updater for Neon DB — run via cron (tickers/news every 30m, top picks daily).

Daily top_picks job refreshes ALL sector × timeframe combinations:
  10 sectors × 3 horizons (daily, monthly, yearly) = 30 rows in top_picks.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import datetime
from zoneinfo import ZoneInfo

from database import (
    TOP_PICK_SECTORS,
    TOP_PICK_TIMEFRAMES,
    get_top_picks_rows,
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
    format_news_for_prompt,
)
from service import generate_sector_top_picks_for_cron

logger = logging.getLogger("smartsarmaya.cron")
PKT = ZoneInfo("Asia/Karachi")

# Pause between LLM generations to stay under Groq TPM / TradingView rate limits.
CRON_PICKS_PAUSE_SECONDS = 20
EXPECTED_TOP_PICKS_JOBS = len(TOP_PICK_SECTORS) * len(TOP_PICK_TIMEFRAMES)


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


def _daily_symbols_for_sector(sector: str) -> list[str] | None:
    """Reuse symbols from an existing daily row when building monthly/yearly picks."""
    rows = get_top_picks_rows("daily", sector)
    if not rows:
        return None
    payload = rows[0].ai_response_json or {}
    symbols = [
        str(pick.get("symbol", "")).strip().upper()
        for pick in payload.get("picks", [])
        if str(pick.get("symbol", "")).strip()
    ]
    return symbols or None


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


def update_top_picks(*, fill_missing_only: bool = False) -> None:
    """
    Generate Top Halal Picks for every sector and horizon, then UPSERT into Neon DB.

    Default (daily cron): refresh all 30 rows with fresh AI picks and live prices.
    fill_missing_only: only create rows that do not exist yet (manual backfill).
    """
    mode = "fill-missing" if fill_missing_only else "refresh-all"
    logger.info(
        "Starting Top Halal Picks update (%s) at %s PKT — %s jobs across %s sectors × %s horizons.",
        mode,
        datetime.now(PKT),
        EXPECTED_TOP_PICKS_JOBS,
        len(TOP_PICK_SECTORS),
        len(TOP_PICK_TIMEFRAMES),
    )
    init_db()

    news = fetch_pakistan_news(limit=5)
    news_text = format_news_for_prompt(news)

    succeeded = 0
    failed = 0
    skipped = 0
    job_index = 0

    for sector in TOP_PICK_SECTORS:
        for timeframe in TOP_PICK_TIMEFRAMES:
            job_index += 1
            label = f"{timeframe}/{sector}"

            if fill_missing_only and get_top_picks_rows(timeframe, sector):
                skipped += 1
                logger.info(
                    "[%s/%s] Skipping existing top picks for %s.",
                    job_index,
                    EXPECTED_TOP_PICKS_JOBS,
                    label,
                )
                continue

            try:
                recommended = (
                    _daily_symbols_for_sector(sector) if timeframe != "daily" else None
                )
                result = generate_sector_top_picks_for_cron(
                    timeframe,
                    sector,
                    news=news,
                    news_text=news_text,
                    recommended_symbols=recommended,
                )
                payload = {
                    "picks": result.get("picks", []),
                    "report_html": result.get("report_html", ""),
                }
                if not payload["picks"]:
                    raise ValueError(f"No picks returned for {label}")

                upsert_top_picks(timeframe, sector, payload)
                succeeded += 1
                logger.info(
                    "[%s/%s] Upserted top picks for %s (%s picks).",
                    job_index,
                    EXPECTED_TOP_PICKS_JOBS,
                    label,
                    len(payload["picks"]),
                )
            except Exception:
                failed += 1
                logger.exception(
                    "[%s/%s] Failed to update top picks for %s",
                    job_index,
                    EXPECTED_TOP_PICKS_JOBS,
                    label,
                )

            if job_index < EXPECTED_TOP_PICKS_JOBS:
                time.sleep(CRON_PICKS_PAUSE_SECONDS)

    logger.info(
        "Top Halal Picks cron finished (%s): %s succeeded, %s failed, %s skipped (target %s).",
        mode,
        succeeded,
        failed,
        skipped,
        EXPECTED_TOP_PICKS_JOBS,
    )

    if failed and not succeeded:
        raise RuntimeError(f"Top picks cron failed for all {failed} attempted jobs.")


def main(argv: list[str] | None = None) -> int:
    _setup_logging()
    parser = argparse.ArgumentParser(description="SmartSarmaya Neon DB background updater")
    parser.add_argument(
        "job",
        choices=("tickers", "top_picks"),
        help="tickers = 30-min job; top_picks = daily Top Halal Picks refresh",
    )
    parser.add_argument(
        "--fill-missing",
        action="store_true",
        help="top_picks only: skip rows that already exist (default: refresh all 30 rows)",
    )
    args = parser.parse_args(argv)

    try:
        if args.job == "tickers":
            update_tickers_and_news()
        else:
            update_top_picks(fill_missing_only=args.fill_missing)
    except Exception:
        logger.exception("Cron job failed: %s", args.job)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
