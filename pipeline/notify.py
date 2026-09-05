"""Publish new content to a Telegram channel.

Telegram is free, has no approval process, and its Bot API is a single HTTP
call, which makes it the one distribution channel that can be fully automated
on a free tier. Each brief and each day's picks are pushed to a public channel
with a link back to the site.

Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID to enable it. With either
missing, every function here becomes a no-op and logs why, so the pipeline runs
unchanged on a deployment that has not configured Telegram.
"""

from __future__ import annotations

import html
import logging
import os
from typing import Any

import requests

from pipeline.config import SITE_URL

logger = logging.getLogger("smartsarmaya.notify")

API_BASE = "https://api.telegram.org/bot{token}/sendMessage"
TIMEOUT = 20
MAX_LENGTH = 4000  # Telegram's limit is 4096; leave room for the footer.


def _token() -> str:
    return (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()


def _channel() -> str:
    return (os.environ.get("TELEGRAM_CHANNEL_ID") or "").strip()


def is_enabled() -> bool:
    return bool(_token() and _channel())


def _escape(text: str) -> str:
    return html.escape(str(text or "").strip())


def send(message: str, *, disable_preview: bool = False) -> bool:
    """Post a message. Returns False rather than raising, so a failed post
    never fails the job that produced the content."""
    if not is_enabled():
        logger.info("Telegram not configured; skipping broadcast.")
        return False

    payload: dict[str, Any] = {
        "chat_id": _channel(),
        "text": message[:MAX_LENGTH],
        "parse_mode": "HTML",
        "disable_web_page_preview": disable_preview,
    }

    try:
        response = requests.post(
            API_BASE.format(token=_token()), data=payload, timeout=TIMEOUT
        )
        if response.status_code != 200:
            logger.warning(
                "Telegram rejected the message (%s): %s",
                response.status_code,
                response.text[:200],
            )
            return False
        logger.info("Posted to Telegram (%s characters).", len(message))
        return True
    except requests.RequestException as exc:
        logger.warning("Telegram post failed: %s", exc)
        return False


def broadcast_brief(brief: dict[str, Any]) -> bool:
    """Announce a published market brief."""
    session = "Morning brief" if brief.get("session") == "morning" else "Closing brief"
    date = brief.get("brief_date", "")
    headline = _escape(brief.get("headline", ""))
    summary = _escape(brief.get("summary", ""))

    lines = [f"<b>{session} - {date}</b>", "", f"<b>{headline}</b>", "", summary]

    index_value = brief.get("index_value")
    index_change = brief.get("index_change_pct")
    if index_value:
        arrow = "\U0001F7E2" if (index_change or 0) >= 0 else "\U0001F534"
        lines += ["", f"{arrow} KSE-100 {index_value:,.2f} ({index_change:+.2f}%)"]

    points = brief.get("key_points") or []
    if points:
        lines.append("")
        lines += [f"• {_escape(point)}" for point in points[:4]]

    lines += ["", f'<a href="{SITE_URL}/brief/{date}">Read the full brief</a>']
    return send("\n".join(lines))


def broadcast_track_record(board: dict[str, Any], positions: list[dict[str, Any]]) -> bool:
    """Publish the running record, winners and losers together.

    Every other picks service in this market publishes only what worked. Being
    the one that does not is the whole marketing strategy, so this message
    deliberately shows the bottom of the table as well as the top.
    """
    if not positions:
        return False

    ranked = sorted(positions, key=lambda row: row.get("return_pct") or 0, reverse=True)
    lines = [
        "<b>Halal picks: the running record</b>",
        "",
        "Every open pick, marked to market. Winners and losers.",
        "",
    ]
    for row in ranked:
        symbol = _escape(row.get("symbol", ""))
        value = float(row.get("return_pct") or 0)
        marker = "\U0001F7E2" if value >= 0 else "\U0001F534"
        lines.append(f"{marker} <b>{symbol}</b> {value:+.1f}%  ({row.get('days_held', 0)}d)")

    total = board.get("total") or 0
    if total:
        lines += [
            "",
            f"{board.get('hit_rate')}% of {total} picks in profit, "
            f"average {float(board.get('avg_return') or 0):+.1f}%.",
        ]

    lines += [
        "",
        f'<a href="{SITE_URL}/track-record">See the full track record</a>',
        "",
        "<i>Educational only. Not financial advice.</i>",
    ]
    return send("\n".join(lines))


def broadcast_picks(picks: list[dict[str, Any]], *, horizon: str, pick_date: str) -> bool:
    """Announce the day's halal picks."""
    if not picks:
        return False

    label = {
        "daily": "Short term",
        "monthly": "Medium term",
        "yearly": "Long term",
    }.get(horizon, horizon.title())

    lines = [
        f"<b>Top halal picks - {label}</b>",
        f"<i>{pick_date}</i>",
        "",
        "Screened against the KMI All Shares Islamic Index.",
        "",
    ]

    for index, pick in enumerate(picks[:6], start=1):
        symbol = _escape(pick.get("symbol", ""))
        sector = _escape(pick.get("sector", ""))
        price = _escape(pick.get("current_price", ""))
        why = _escape(pick.get("why", ""))[:180]
        lines.append(f"<b>{index}. {symbol}</b> ({sector}) at {price}")
        if why:
            lines.append(f"   {why}")
        lines.append("")

    lines += [
        f'<a href="{SITE_URL}/#picks">See all picks and the track record</a>',
        "",
        "<i>Educational only. Not financial advice, not a religious ruling.</i>",
    ]
    return send("\n".join(lines))
