"""AI commentary for individual stock pages.

Each stock page is an indexable URL of its own. Rotating a batch per run keeps
the whole covered universe fresh without exhausting the free model quota.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime
from typing import Any

from sqlalchemy import select

from pipeline import db, llm, news as news_module, prompts
from pipeline.config import PKT, STOCK_PAGE_BATCH

logger = logging.getLogger("smartsarmaya.jobs.stocks")


def _technicals_block(row: db.Stock) -> str:
    def fmt(value: Any, suffix: str = "") -> str:
        return f"{value}{suffix}" if value is not None else "n/a"

    return "\n".join(
        [
            f"- Trend: {row.trend or 'n/a'} (rules-based signal: {row.signal or 'n/a'})",
            f"- RSI(14): {fmt(row.rsi_14)}",
            f"- Price vs 50-day average: "
            f"{'above' if row.sma_50 and row.current_price > row.sma_50 else 'below'}",
            f"- Price vs 200-day average: "
            f"{'above' if row.sma_200 and row.current_price > row.sma_200 else 'below'}",
            f"- Change: 1 month {fmt(row.change_1m_pct, '%')}, "
            f"3 months {fmt(row.change_3m_pct, '%')}, 1 year {fmt(row.change_1y_pct, '%')}",
            f"- Position in 52-week range: {_range_position(row)}",
            f"- 30-day average volume: {fmt(row.avg_volume_30d)}",
            f"- Daily volatility: {fmt(row.volatility_pct, '%')}",
        ]
    )


def _range_position(row: db.Stock) -> str:
    if not row.low_52w or not row.high_52w or row.high_52w <= row.low_52w:
        return "n/a"
    pct = (row.current_price - row.low_52w) / (row.high_52w - row.low_52w) * 100
    return f"{pct:.0f}% of the range"


def _stale_symbols(limit: int) -> list[str]:
    """Symbols whose note is missing or oldest, most liquid first."""
    with db.session_scope() as session:
        rows = session.execute(
            select(db.Stock.symbol, db.Stock.volume, db.StockNote.updated_at)
            .outerjoin(db.StockNote, db.StockNote.symbol == db.Stock.symbol)
            .where(
                db.Stock.is_kmi.is_(True),
                db.Stock.is_debt.is_(False),
                db.Stock.is_etf.is_(False),
                db.Stock.current_price > 0,
                db.Stock.trend != "",
            )
        ).all()

    never_written = [row[0] for row in rows if row[2] is None]
    never_written.sort(
        key=lambda symbol: next((row[1] or 0 for row in rows if row[0] == symbol), 0),
        reverse=True,
    )
    if len(never_written) >= limit:
        return never_written[:limit]

    written = sorted(
        (row for row in rows if row[2] is not None), key=lambda row: row[2]
    )
    return never_written + [row[0] for row in written[: limit - len(never_written)]]


# Groq's free tier refills a small token bucket every minute, so a batch of
# notes spends most of its time waiting rather than generating. The budget keeps
# a scheduled run inside the workflow timeout; whatever is not reached this time
# is simply first in line on the next run, because symbols are ordered stalest
# first.
DEFAULT_TIME_BUDGET_SECONDS = 22 * 60
CONSECUTIVE_FAILURE_LIMIT = 8


def run(
    limit: int = STOCK_PAGE_BATCH,
    time_budget_seconds: int = DEFAULT_TIME_BUDGET_SECONDS,
) -> dict[str, int]:
    db.init_db()
    if not llm.is_configured():
        raise RuntimeError("No LLM provider configured: set GROQ_API_KEY or GEMINI_API_KEY.")

    symbols = _stale_symbols(limit)
    if not symbols:
        logger.info("No stock notes need refreshing.")
        return {"written": 0, "failed": 0, "seconds": 0, "stopped_early": ""}

    started = time.monotonic()
    consecutive_failures = 0
    stopped_early = ""
    logger.info(
        "Refreshing up to %s stock notes (budget %s minutes).",
        len(symbols),
        round(time_budget_seconds / 60),
    )
    headlines = db.recent_news(limit=6)
    news_block = news_module.format_for_prompt(headlines, limit=6)
    events = db.upcoming_events_for(symbols)

    written = 0
    failed = 0
    batch: list[dict[str, Any]] = []

    for index, symbol in enumerate(symbols, start=1):
        if time.monotonic() - started > time_budget_seconds:
            stopped_early = "time budget reached"
            logger.info("Stopping after %s symbols: %s.", index - 1, stopped_early)
            break
        if consecutive_failures >= CONSECUTIVE_FAILURE_LIMIT:
            stopped_early = "provider refusing repeatedly"
            logger.warning("Stopping after %s symbols: %s.", index - 1, stopped_early)
            break

        with db.session_scope() as session:
            row = session.execute(
                select(db.Stock).where(db.Stock.symbol == symbol)
            ).scalar_one_or_none()
        if row is None:
            continue

        symbol_events = events.get(symbol)
        user_prompt = prompts.stock_note_user(
            symbol=symbol,
            name=row.name or symbol,
            sector=row.sector_name or "Unclassified",
            halal_label=(
                "Constituent of the KMI All Shares Islamic Index (Shariah compliant)"
                if row.is_kmi
                else "Not a KMI All Shares Islamic Index constituent"
            ),
            technicals_block=_technicals_block(row),
            events_block="; ".join(symbol_events) if symbol_events else "None scheduled.",
            news_block=news_block,
        )

        try:
            payload, model_used = llm.complete_json(
                prompts.STOCK_NOTE_SYSTEM, user_prompt, fast=True, max_tokens=1200
            )
        except Exception:  # noqa: BLE001 - skip this symbol, keep the run going
            failed += 1
            consecutive_failures += 1
            logger.warning("[%s/%s] %s: note generation failed.", index, len(symbols), symbol)
            continue

        consecutive_failures = 0

        verdict = str(payload.get("verdict", "")).strip().title()
        if verdict not in {"Accumulate", "Hold", "Watch", "Caution"}:
            verdict = "Hold"

        batch.append(
            {
                "symbol": symbol,
                "headline": str(payload.get("headline", "")).strip()[:280],
                "overview": str(payload.get("overview", "")).strip(),
                "bull_case": str(payload.get("bull_case", "")).strip(),
                "bear_case": str(payload.get("bear_case", "")).strip(),
                "verdict": verdict,
                "model_used": model_used,
            }
        )
        written += 1

        if len(batch) >= 10:
            db.upsert_stock_notes(batch)
            logger.info("[%s/%s] flushed %s notes.", index, len(symbols), len(batch))
            batch = []

    if batch:
        db.upsert_stock_notes(batch)

    elapsed = round(time.monotonic() - started)
    logger.info(
        "Stock notes finished in %ss: %s written, %s failed%s.",
        elapsed,
        written,
        failed,
        f" ({stopped_early})" if stopped_early else "",
    )
    return {
        "written": written,
        "failed": failed,
        "seconds": elapsed,
        "stopped_early": stopped_early,
    }
