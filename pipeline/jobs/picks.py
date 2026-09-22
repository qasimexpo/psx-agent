"""Top Shariah-compliant picks.

Three things changed relative to the previous implementation:

* Compliance is decided by the exchange, not the model. Candidates come from
  the KMI All Shares Islamic Index, so a conventional bank or a tobacco stock
  can no longer appear in a "halal" list.
* One model call per sector produces all three horizons, which is what stops
  daily, monthly and yearly from returning the same three names.
* Picks are stored with the date they were made, and every pick is written to a
  tracking table, so the site can show a real record instead of only today's
  opinion.

Prices are never taken from the model. They are attached afterwards from the
database, and any symbol the model invents is discarded.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime
from typing import Any

from pipeline import db, llm, news as news_module, notify, prompts, psx, social
from pipeline.config import (
    PICK_SECTORS,
    PICK_TIMEFRAMES,
    PICKS_PAUSE_SECONDS,
    PICKS_PER_SECTOR,
    PKT,
    SECTOR_CODE_MAP,
)

logger = logging.getLogger("smartsarmaya.jobs.picks")

MAX_CANDIDATES = 12
BUY_ZONE_DISCOUNT = 0.03  # 3% below the current price
EXIT_TARGET_BY_HORIZON = {"daily": 0.06, "monthly": 0.14, "yearly": 0.28}


def _fmt(value: Any, suffix: str = "") -> str:
    if value is None:
        return "n/a"
    return f"{value}{suffix}"


def _candidates_for(sector: str) -> list[dict[str, Any]]:
    codes = SECTOR_CODE_MAP.get(sector, ())
    universe = db.halal_universe(sector_codes=codes)
    ranked = sorted(
        universe,
        key=lambda row: (row.get("avg_volume_30d") or row.get("volume") or 0),
        reverse=True,
    )
    return ranked[:MAX_CANDIDATES]


def _candidates_block(rows: list[dict[str, Any]]) -> str:
    lines = []
    for row in rows:
        lines.append(
            f"- {row['symbol']} ({row['name'][:42]}): "
            f"RSI14={_fmt(row.get('rsi_14'))} trend={row.get('trend') or 'n/a'} "
            f"rule_signal={row.get('signal') or 'n/a'} "
            f"1M={_fmt(row.get('change_1m_pct'), '%')} 1Y={_fmt(row.get('change_1y_pct'), '%')} "
            f"vs50dma={'above' if (row.get('sma_50') and row['price'] > row['sma_50']) else 'below'} "
            f"vs200dma={'above' if (row.get('sma_200') and row['price'] > row['sma_200']) else 'below'} "
            f"52w_position={_position_in_range(row)}"
        )
    return "\n".join(lines) if lines else "No candidates available."


def _position_in_range(row: dict[str, Any]) -> str:
    low, high, price = row.get("low_52w"), row.get("high_52w"), row.get("price")
    if not low or not high or not price or high <= low:
        return "n/a"
    pct = (price - low) / (high - low) * 100
    if pct >= 85:
        return "near 52w high"
    if pct <= 15:
        return "near 52w low"
    return f"{pct:.0f}% of 52w range"


def _sector_context(sector: str) -> str:
    codes = SECTOR_CODE_MAP.get(sector, ())
    if not codes:
        return "No sector breadth available."
    from sqlalchemy import select

    with db.session_scope() as session:
        rows = session.execute(
            select(db.SectorStat).where(db.SectorStat.sector_code.in_(list(codes)))
        ).scalars().all()

    if not rows:
        return "No sector breadth available."
    return "\n".join(
        f"- {row.sector_name}: {row.advance} advancing, {row.decline} declining, "
        f"turnover {row.turnover:,}, market cap {row.market_cap_bn}bn PKR"
        for row in rows
    )


def _events_block(symbols: list[str]) -> str:
    events = db.upcoming_events_for(symbols)
    if not events:
        return "No corporate actions scheduled in the next 45 days."
    return "\n".join(f"- {symbol}: {'; '.join(items)}" for symbol, items in events.items())


def _derive_levels(price: float, horizon: str) -> tuple[str, str]:
    """Buy zone and exit target, computed from live price, never from the model."""
    buy_low = price * (1 - BUY_ZONE_DISCOUNT)
    target = price * (1 + EXIT_TARGET_BY_HORIZON.get(horizon, 0.1))
    return f"{buy_low:,.2f} - {price:,.2f}", f"{target:,.2f}"


def _build_pick(
    item: dict[str, Any], candidate: dict[str, Any], horizon: str, sector: str
) -> dict[str, Any]:
    price = float(candidate["price"])
    buy_zone, exit_target = _derive_levels(price, horizon)
    return {
        "symbol": candidate["symbol"],
        "name": candidate["name"],
        "sector": sector,
        "summary": str(item.get("summary", "")).strip()[:400],
        "why": str(item.get("why", "")).strip()[:400],
        "risk": str(item.get("risk", "")).strip()[:300],
        "current_price": f"{price:,.2f}",
        "buy_zone": buy_zone,
        "exit_target": exit_target,
        "rsi": candidate.get("rsi_14"),
        "trend": candidate.get("trend"),
        "signal": candidate.get("signal"),
        "change_pct": candidate.get("change_pct"),
        "halal_verified": True,
    }


def _generate_for_sector(
    sector: str, report_date: str, news_block: str
) -> tuple[dict[str, list[dict[str, Any]]], str]:
    candidates = _candidates_for(sector)
    if len(candidates) < 2:
        raise ValueError(f"Only {len(candidates)} Shariah-compliant candidates for {sector}.")

    by_symbol = {row["symbol"]: row for row in candidates}
    user_prompt = prompts.sector_picks_user(
        sector=sector,
        report_date=report_date,
        candidates_block=_candidates_block(candidates),
        sector_context=_sector_context(sector),
        news_block=news_block,
        events_block=_events_block(list(by_symbol)),
    )

    payload, model_used = llm.complete_json(
        prompts.SECTOR_PICKS_SYSTEM, user_prompt, max_tokens=3000
    )

    result: dict[str, list[dict[str, Any]]] = {}
    for horizon in PICK_TIMEFRAMES:
        raw_items = payload.get(horizon)
        if not isinstance(raw_items, list):
            raw_items = []

        picks: list[dict[str, Any]] = []
        seen: set[str] = set()
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            symbol = psx.normalize_symbol(item.get("symbol"))
            candidate = by_symbol.get(symbol)
            if candidate is None:
                logger.warning(
                    "%s/%s: discarding %s, not in the compliant candidate list.",
                    sector, horizon, symbol or item.get("symbol"),
                )
                continue
            if symbol in seen:
                continue
            seen.add(symbol)
            picks.append(_build_pick(item, candidate, horizon, sector))
            if len(picks) >= PICKS_PER_SECTOR:
                break

        # Backfill from the ranked candidates if the model returned too few.
        for candidate in candidates:
            if len(picks) >= 2:
                break
            if candidate["symbol"] in seen:
                continue
            seen.add(candidate["symbol"])
            picks.append(
                _build_pick(
                    {
                        "summary": f"{candidate['name']} is among the most liquid "
                        f"Shariah-compliant names in {sector}.",
                        "why": "Included on liquidity and index membership while the "
                        "model response was incomplete.",
                        "risk": "Thesis not individually reviewed this run.",
                    },
                    candidate,
                    horizon,
                    sector,
                )
            )

        result[horizon] = picks

    return result, model_used


def run(sectors: list[str] | None = None) -> dict[str, int]:
    """Generate and store picks for every sector and horizon."""
    db.init_db()
    if not llm.is_configured():
        raise RuntimeError("No LLM provider configured: set GROQ_API_KEY or GEMINI_API_KEY.")

    now = datetime.now(PKT)
    today = now.date()
    report_date = now.strftime("%A, %d %B %Y")
    target_sectors = sectors or list(PICK_SECTORS)

    headlines = db.recent_news(limit=10) or news_module.fetch_all(limit_per_region=5)
    news_block = news_module.format_for_prompt(headlines)

    succeeded = 0
    failed = 0
    tracked = 0

    for index, sector in enumerate(target_sectors, start=1):
        label = f"[{index}/{len(target_sectors)}] {sector}"

        # Stay inside the free tier's tokens-per-minute allowance.
        if index > 1 and PICKS_PAUSE_SECONDS:
            time.sleep(PICKS_PAUSE_SECONDS)

        try:
            horizons, model_used = _generate_for_sector(sector, report_date, news_block)
        except Exception:  # noqa: BLE001 - one sector must not stop the run
            failed += 1
            logger.exception("%s: generation failed.", label)
            continue

        entries: list[dict[str, Any]] = []
        for horizon, picks in horizons.items():
            if not picks:
                continue
            db.upsert_top_picks(
                timeframe=horizon,
                sector=sector,
                pick_date=today,
                payload={"picks": picks, "generated_at": now.isoformat()},
                model_used=model_used,
            )
            for pick in picks:
                try:
                    entry_price = float(str(pick["current_price"]).replace(",", ""))
                    exit_target = float(str(pick["exit_target"]).replace(",", ""))
                except (TypeError, ValueError):
                    continue
                entries.append(
                    {
                        "symbol": pick["symbol"],
                        "timeframe": horizon,
                        "sector": sector,
                        "entry_date": today,
                        "entry_price": entry_price,
                        "exit_target": exit_target,
                        "last_price": entry_price,
                        "return_pct": 0.0,
                        "best_return_pct": 0.0,
                        "days_held": 0,
                        "status": "open",
                    }
                )

        tracked += db.record_pick_entries(entries)
        succeeded += 1
        logger.info(
            "%s: stored %s horizons via %s.",
            label,
            sum(1 for picks in horizons.values() if picks),
            model_used,
        )

    # Mark every open pick to market so the scorecard is current.
    prices = db.price_lookup()
    marked = db.refresh_pick_track(prices, today)
    board = db.scorecard()

    # Announce today's short-term list across every sector to Telegram.
    broadcast = False
    if succeeded:
        merged: list[dict[str, Any]] = []
        seen_symbols: set[str] = set()
        for sector in target_sectors:
            latest = db.get_latest_picks("daily", sector)
            if not latest or latest["pick_date"] != today:
                continue
            for pick in latest["payload"].get("picks", []):
                if pick["symbol"] in seen_symbols:
                    continue
                seen_symbols.add(pick["symbol"])
                merged.append(pick)
        if merged:
            pretty_date = today.strftime("%d %B %Y")
            broadcast = notify.broadcast_picks(
                merged, horizon="daily", pick_date=pretty_date
            )
            social.broadcast(
                social.picks_post(merged, horizon="daily", pick_date=pretty_date)
            )

    logger.info(
        "Picks run complete: %s sectors ok, %s failed, %s new tracked entries, "
        "%s positions marked to market. Hit rate %s%% over %s picks.",
        succeeded, failed, tracked, marked["updated"], board["hit_rate"], board["total"],
    )

    if failed and not succeeded:
        raise RuntimeError(f"Picks failed for all {failed} sectors.")

    return {
        "sectors_ok": succeeded,
        "sectors_failed": failed,
        "tracked": tracked,
        "marked": marked["updated"],
        "hit_rate": board["hit_rate"],
        "telegram": broadcast,
    }


def run_scorecard_only() -> dict[str, Any]:
    """Mark open picks to market without generating anything new."""
    db.init_db()
    today = datetime.now(PKT).date()
    marked = db.refresh_pick_track(db.price_lookup(), today)
    board = db.scorecard()
    logger.info("Scorecard refreshed: %s positions, hit rate %s%%.", marked["updated"], board["hit_rate"])

    # Once a week, publish the running record including the losers. Nobody else
    # in this market does that, and it is the post that earns the trust the
    # rest of the site trades on. Friday, because it closes the trading week.
    posted = False
    if today.weekday() == 4 and board.get("total"):
        positions = db.tracked_positions()
        if positions:
            social.broadcast(social.track_record_post(board, positions))
            notify.broadcast_track_record(board, positions)
            posted = True

    return {**marked, **board, "weekly_post": posted}
