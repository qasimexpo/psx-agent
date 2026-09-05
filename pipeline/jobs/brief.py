"""AI market brief, written twice a trading day.

This is the content engine. Each run produces a dated page the search engines
can index and a short piece worth sharing, which is what turns a single-page
tool into a site that accumulates traffic.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy import select

from pipeline import db, llm, news as news_module, notify, prompts, social
from pipeline.config import PKT

logger = logging.getLogger("smartsarmaya.jobs.brief")

SESSIONS = {
    "morning": "pre-market morning",
    "closing": "post-close",
}


def _index_block() -> tuple[str, float | None, float | None]:
    with db.session_scope() as session:
        row = session.execute(
            select(db.MarketIndex)
            .where(db.MarketIndex.name == "KSE100")
            .order_by(db.MarketIndex.day.desc())
            .limit(1)
        ).scalar_one_or_none()

        history = session.execute(
            select(db.MarketIndex.day, db.MarketIndex.value)
            .where(db.MarketIndex.name == "KSE100")
            .order_by(db.MarketIndex.day.desc())
            .limit(6)
        ).all()

    if row is None:
        return "KSE-100 data unavailable.", None, None

    lines = [
        f"Level: {row.value:,.2f}",
        f"Move: {row.change:+,.2f} ({row.change_pct:+.2f}%)",
    ]
    if len(history) > 1:
        trail = ", ".join(f"{day.isoformat()}: {value:,.0f}" for day, value in history[1:])
        lines.append(f"Previous closes: {trail}")
    return "\n".join(lines), row.value, row.change_pct


def _movers_block() -> str:
    with db.session_scope() as session:
        rows = session.execute(
            select(db.Mover).order_by(db.Mover.kind, db.Mover.rank)
        ).scalars().all()

    if not rows:
        return "No mover data available."

    buckets: dict[str, list[str]] = {}
    for row in rows:
        if row.rank > 5:
            continue
        tag = " [Shariah compliant]" if row.is_kmi else ""
        buckets.setdefault(row.kind, []).append(
            f"{row.symbol} {row.price:,.2f} ({row.change_pct:+.2f}%), "
            f"volume {row.volume:,}{tag}"
        )

    labels = {"gainers": "Top gainers", "losers": "Top losers", "most_active": "Most active"}
    return "\n".join(
        f"{labels.get(kind, kind)}: " + "; ".join(items) for kind, items in buckets.items()
    )


def _sector_block() -> str:
    with db.session_scope() as session:
        rows = session.execute(
            select(db.SectorStat).order_by(db.SectorStat.turnover.desc()).limit(8)
        ).scalars().all()
    if not rows:
        return "No sector breadth available."
    return "\n".join(
        f"- {row.sector_name}: {row.advance} up / {row.decline} down, turnover {row.turnover:,}"
        for row in rows
    )


def _events_block(limit: int = 10) -> str:
    today = datetime.now(PKT).date()
    with db.session_scope() as session:
        payouts = session.execute(
            select(db.Payout)
            .where(db.Payout.book_closure_from.is_not(None), db.Payout.book_closure_from >= today)
            .order_by(db.Payout.book_closure_from)
            .limit(limit)
        ).scalars().all()
        events = session.execute(
            select(db.CorporateEvent)
            .where(db.CorporateEvent.event_date.is_not(None), db.CorporateEvent.event_date >= today)
            .order_by(db.CorporateEvent.event_date)
            .limit(limit)
        ).scalars().all()

    lines = [
        f"- {row.symbol}: {row.payout}, book closure {row.book_closure_from.isoformat()}"
        for row in payouts
    ]
    lines += [
        f"- {row.symbol}: {row.event_type} on {row.event_date.isoformat()}" for row in events
    ]
    return "\n".join(lines) if lines else "Nothing scheduled in the near term."


def run(session_name: str = "closing") -> dict[str, Any]:
    session_name = session_name.strip().lower()
    if session_name not in SESSIONS:
        raise ValueError(f"Unknown session '{session_name}'. Use one of {list(SESSIONS)}.")

    db.init_db()
    if not llm.is_configured():
        raise RuntimeError("No LLM provider configured: set GROQ_API_KEY or GEMINI_API_KEY.")

    now = datetime.now(PKT)
    today = now.date()
    index_block, index_value, index_change = _index_block()
    headlines = db.recent_news(limit=12) or news_module.fetch_all(limit_per_region=6)

    user_prompt = prompts.market_brief_user(
        session_label=SESSIONS[session_name],
        report_date=now.strftime("%A, %d %B %Y"),
        index_block=index_block,
        movers_block=_movers_block(),
        sector_block=_sector_block(),
        events_block=_events_block(),
        news_block=news_module.format_for_prompt(headlines, limit=12),
    )

    payload, model_used = llm.complete_json(
        prompts.MARKET_BRIEF_SYSTEM, user_prompt, max_tokens=2600
    )

    key_points = [str(point).strip() for point in payload.get("key_points", []) if str(point).strip()]
    symbols = [
        str(symbol).strip().upper()
        for symbol in payload.get("symbols", [])
        if str(symbol).strip()
    ][:6]

    row = {
        "brief_date": today,
        "session": session_name,
        "headline": str(payload.get("headline", "")).strip()[:280] or f"PSX {SESSIONS[session_name]} brief",
        "summary": str(payload.get("summary", "")).strip(),
        "body_html": str(payload.get("body_html", "")).strip(),
        "key_points": key_points[:5],
        "symbols": symbols,
        "index_value": index_value,
        "index_change_pct": index_change,
        "model_used": model_used,
    }

    if not row["summary"] or not row["body_html"]:
        raise RuntimeError("Brief generation returned an empty body.")

    db.upsert_brief(row)
    logger.info("Stored %s brief for %s via %s: %s", session_name, today, model_used, row["headline"])

    published = {**row, "brief_date": today.isoformat(), "session": session_name}
    broadcast = notify.broadcast_brief(published)

    # The closing edition carries the day's gainers and losers, because a
    # scoreboard is the post people actually engage with. The morning edition
    # goes out as a headline, before there is anything to score.
    movers = db.latest_movers() if session_name == "closing" else None
    social_results = social.broadcast(social.brief_post(published, movers))

    return {
        "date": today.isoformat(),
        "session": session_name,
        "headline": row["headline"],
        "telegram": broadcast,
        "social": social_results,
    }
