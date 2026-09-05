"""Market data jobs.

`run()`        light refresh during trading hours: quotes, movers, index.
               Four HTTP requests total, regardless of how many symbols exist.
`run_technicals()` heavier daily pass that pulls end-of-day history for the
               covered universe and derives the indicators.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime

from pipeline import db, indicators, psx
from pipeline.config import PKT, SECTOR_CODE_NAMES

logger = logging.getLogger("smartsarmaya.jobs.market")

# Symbols we compute indicators for: index constituents plus anything Shariah
# compliant that actually trades.
MIN_TECHNICAL_VOLUME = 25_000


def _directory_lookup() -> dict[str, dict[str, str]]:
    try:
        return {row["symbol"]: row for row in psx.fetch_symbol_directory()}
    except psx.PsxUnavailableError:
        logger.warning("Symbol directory unavailable; keeping existing names.")
        return {}


def run() -> dict[str, int]:
    """Refresh quotes, movers, sector stats and the KSE-100 snapshot."""
    db.init_db()
    now = datetime.now(PKT)
    logger.info("Market refresh starting at %s PKT.", now.strftime("%Y-%m-%d %H:%M"))

    snapshot = psx.fetch_market_watch()
    directory = _directory_lookup()

    rows = []
    for item in snapshot:
        symbol = item["symbol"]
        meta = directory.get(symbol, {})
        rows.append(
            {
                "symbol": symbol,
                "name": meta.get("name") or symbol,
                "sector_code": item["sector_code"],
                "sector_name": meta.get("sector_name")
                or SECTOR_CODE_NAMES.get(item["sector_code"], ""),
                "is_kmi": item["is_kmi"],
                "is_kmi30": item["is_kmi30"],
                "is_kse100": item["is_kse100"],
                "is_etf": bool(meta.get("is_etf")),
                "is_debt": bool(meta.get("is_debt")),
                "ldcp": item["ldcp"],
                "open": item["open"],
                "high": item["high"],
                "low": item["low"],
                "current_price": item["current"],
                "change": item["change"],
                "change_pct": item["change_pct"],
                "volume": item["volume"],
                "quote_at": now,
            }
        )

    stock_count = db.upsert_stocks(rows)
    halal_count = sum(1 for row in rows if row["is_kmi"])
    logger.info("Upserted %s quotes (%s Shariah compliant).", stock_count, halal_count)

    # Movers
    mover_count = 0
    try:
        halal = {row["symbol"] for row in rows if row["is_kmi"]}
        names = {row["symbol"]: row["name"] for row in rows}
        buckets = psx.fetch_performers()
        for items in buckets.values():
            for item in items:
                item["name"] = names.get(item["symbol"], item["symbol"])
        mover_count = db.replace_movers(buckets, halal)
        logger.info("Stored %s movers.", mover_count)
    except psx.PsxUnavailableError:
        logger.warning("Performers unavailable this run.")

    # Sector stats
    sector_count = 0
    try:
        sector_count = db.upsert_sector_stats(psx.fetch_sector_summary())
        logger.info("Stored %s sector rows.", sector_count)
    except psx.PsxUnavailableError:
        logger.warning("Sector summary unavailable this run.")

    # Index
    index_ok = 0
    try:
        index = psx.fetch_index_snapshot(psx.KSE100_INDEX)
        db.upsert_index_snapshot(
            name=index["name"],
            day=now.date(),
            value=index["value"],
            change=index["change"],
            change_pct=index["change_pct"],
            sparkline=index["sparkline"],
        )
        added = db.upsert_index_history(index["name"], index["history"])
        index_ok = 1
        logger.info(
            "KSE-100 at %s (%+.2f%%); backfilled %s historical days.",
            index["value"],
            index["change_pct"],
            added,
        )
    except psx.PsxUnavailableError:
        logger.warning("KSE-100 snapshot unavailable this run.")

    return {
        "stocks": stock_count,
        "halal": halal_count,
        "movers": mover_count,
        "sectors": sector_count,
        "index": index_ok,
    }


def covered_symbols() -> list[str]:
    """Symbols worth computing indicators for, stalest first.

    Ordering by `tech_at` means each run refreshes whatever is most out of date.
    Combined with the time budget below, successive runs cover the whole
    universe without any one run needing to finish it.
    """
    with db.session_scope() as session:
        from sqlalchemy import or_, select

        rows = session.execute(
            select(db.Stock.symbol, db.Stock.volume, db.Stock.is_kmi, db.Stock.is_kse100)
            .where(
                db.Stock.is_debt.is_(False),
                db.Stock.is_etf.is_(False),
                db.Stock.current_price > 0,
                or_(
                    db.Stock.is_kse100.is_(True),
                    db.Stock.is_kmi30.is_(True),
                    db.Stock.is_kmi.is_(True),
                ),
            )
            .order_by(db.Stock.tech_at.asc().nulls_first(), db.Stock.volume.desc())
        ).all()

    return [
        symbol
        for symbol, volume, is_kmi, is_kse100 in rows
        if is_kse100 or (volume or 0) >= MIN_TECHNICAL_VOLUME or is_kmi
    ]


# A scheduled run must end well inside the workflow timeout even when the
# exchange is slow, so the loop stops on the clock rather than on the list.
DEFAULT_TIME_BUDGET_SECONDS = 20 * 60
CONSECUTIVE_FAILURE_LIMIT = 25


def run_technicals(
    limit: int | None = None,
    time_budget_seconds: int = DEFAULT_TIME_BUDGET_SECONDS,
) -> dict[str, int]:
    """Pull end-of-day history and derive indicators for the covered universe.

    Stops when the budget is spent or the exchange starts refusing repeatedly.
    Anything not reached is simply first in line on the next run.
    """
    db.init_db()
    symbols = covered_symbols()
    if limit:
        symbols = symbols[:limit]

    logger.info(
        "Computing technicals for up to %s symbols (budget %s minutes).",
        len(symbols),
        round(time_budget_seconds / 60),
    )
    started = time.monotonic()
    now = datetime.now(PKT)
    updates: list[dict[str, object]] = []
    processed = 0
    no_history = 0
    unreachable = 0
    consecutive_failures = 0
    stopped_early = ""

    for index, symbol in enumerate(symbols, start=1):
        if time.monotonic() - started > time_budget_seconds:
            stopped_early = "time budget reached"
            logger.info("Stopping after %s symbols: %s.", index - 1, stopped_early)
            break
        if consecutive_failures >= CONSECUTIVE_FAILURE_LIMIT:
            stopped_early = "too many consecutive failures"
            logger.warning("Stopping after %s symbols: %s.", index - 1, stopped_early)
            break

        try:
            series = psx.fetch_eod(symbol, bulk=True)
        except psx.PsxUnavailableError as exc:
            # A transport failure may mean the exchange is refusing us, so this
            # is what the circuit breaker watches. tech_at is left alone so the
            # symbol stays near the front of the queue for the next run.
            unreachable += 1
            consecutive_failures += 1
            logger.warning("[%s/%s] %s unreachable: %s", index, len(symbols), symbol, exc)
            continue

        consecutive_failures = 0

        if len(series) < 20:
            # A thinly traded or newly listed symbol simply has no history. That
            # is permanent, not a fault, so stamp tech_at to rotate it to the
            # back of the queue instead of retrying it first every single run.
            no_history += 1
            updates.append(
                {"symbol": symbol, "trend": "Insufficient data", "signal": "", "tech_at": now}
            )
            continue

        processed += 1

        tech = indicators.compute(series)
        updates.append(
            {
                "symbol": symbol,
                "rsi_14": tech.rsi_14,
                "sma_20": tech.sma_20,
                "sma_50": tech.sma_50,
                "sma_200": tech.sma_200,
                "support": tech.support,
                "resistance": tech.resistance,
                "high_52w": tech.high_52w,
                "low_52w": tech.low_52w,
                "change_1w_pct": tech.change_1w_pct,
                "change_1m_pct": tech.change_1m_pct,
                "change_3m_pct": tech.change_3m_pct,
                "change_1y_pct": tech.change_1y_pct,
                "volatility_pct": tech.volatility_pct,
                "avg_volume_30d": tech.avg_volume_30d,
                "trend": tech.trend,
                "signal": tech.signal,
                "tech_at": now,
            }
        )

        if len(updates) >= 50:
            db.upsert_stocks(updates)
            logger.info("[%s/%s] flushed %s indicator rows.", index, len(symbols), len(updates))
            updates = []

    if updates:
        db.upsert_stocks(updates)

    elapsed = round(time.monotonic() - started)
    logger.info(
        "Technicals finished in %ss: %s updated, %s with no usable history, "
        "%s unreachable%s.",
        elapsed,
        processed,
        no_history,
        unreachable,
        f" ({stopped_early})" if stopped_early else "",
    )
    return {
        "candidates": len(symbols),
        "updated": processed,
        "no_history": no_history,
        "unreachable": unreachable,
        "seconds": elapsed,
        "stopped_early": stopped_early,
    }
