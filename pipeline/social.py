"""Publish to X, a Facebook Page and Instagram.

Telegram lives in `pipeline.notify` and stays there: it is the private-ish
channel with no character limit and no approval process, so its messages are
long and HTML formatted. Everything here is public, short, and plain text.

Every network is independent and every one of them is optional. A network with
missing credentials is skipped with a log line, a network that fails is logged
and the others still go out, and nothing in this module ever raises into the
job that called it. A failed post must never cost a day's data.

Environment
-----------
X (needs a Basic or Free project with **write** access, OAuth 1.0a user
context - the free tier allows 500 posts a month, and this schedule uses
roughly 90):

    X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET

Facebook Page (a Meta app, plus a long-lived Page access token):

    FACEBOOK_PAGE_ID, FACEBOOK_PAGE_TOKEN

Instagram (a Business account linked to that Page; it reuses the Page token,
and it can only post an image, which is why every post carries a card URL):

    INSTAGRAM_USER_ID
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote

import requests

from pipeline.config import SITE_URL

logger = logging.getLogger("smartsarmaya.social")

TIMEOUT = 30
GRAPH_VERSION = "v21.0"
GRAPH_BASE = f"https://graph.facebook.com/{GRAPH_VERSION}"
X_TWEET_URL = "https://api.x.com/2/tweets"

# X counts every URL as 23 characters regardless of its real length.
X_LIMIT = 280
X_URL_WEIGHT = 23

DISCLAIMER = "Educational only. Not financial advice."


@dataclass
class Post:
    """One piece of content, rendered differently per network."""

    text: str
    link: str = ""
    image_url: str = ""
    hashtags: list[str] = field(default_factory=list)

    def for_x(self) -> str:
        """Trim to fit, dropping hashtags before body text and never the link."""
        reserved = (X_URL_WEIGHT + 1) if self.link else 0
        tags = " ".join(self.hashtags)
        body = self.text.strip()

        if tags and len(body) + 1 + len(tags) + reserved <= X_LIMIT:
            body = f"{body}\n{tags}"
        elif len(body) + reserved > X_LIMIT:
            body = body[: X_LIMIT - reserved - 1].rstrip() + "…"

        return f"{body}\n{self.link}".strip() if self.link else body

    def for_meta(self) -> str:
        """Facebook and Instagram have no practical limit, so nothing is cut."""
        parts = [self.text.strip()]
        if self.link:
            parts.append(self.link)
        if self.hashtags:
            parts.append(" ".join(self.hashtags))
        return "\n\n".join(part for part in parts if part)


# ---------------------------------------------------------------------------
# card URLs
# ---------------------------------------------------------------------------
def card_url(**params: str) -> str:
    """A share card from the site's /og route. Instagram needs a public URL."""
    query = "&".join(f"{key}={quote(str(value))}" for key, value in params.items())
    return f"{SITE_URL}/og?{query}"


# ---------------------------------------------------------------------------
# X
# ---------------------------------------------------------------------------
def _x_credentials() -> tuple[str, str, str, str] | None:
    keys = (
        os.environ.get("X_API_KEY", "").strip(),
        os.environ.get("X_API_SECRET", "").strip(),
        os.environ.get("X_ACCESS_TOKEN", "").strip(),
        os.environ.get("X_ACCESS_TOKEN_SECRET", "").strip(),
    )
    return keys if all(keys) else None  # type: ignore[return-value]


def post_to_x(post: Post) -> bool:
    creds = _x_credentials()
    if not creds:
        logger.info("X not configured; skipping.")
        return False

    try:
        from requests_oauthlib import OAuth1
    except ImportError:
        logger.warning("requests-oauthlib is not installed; cannot post to X.")
        return False

    key, secret, token, token_secret = creds
    auth = OAuth1(key, secret, token, token_secret)

    try:
        response = requests.post(
            X_TWEET_URL, json={"text": post.for_x()}, auth=auth, timeout=TIMEOUT
        )
    except requests.RequestException as exc:
        logger.warning("X post failed: %s", exc)
        return False

    if response.status_code not in (200, 201):
        # 403 with "duplicate content" is normal when a job is re-run by hand.
        logger.warning("X rejected the post (%s): %s", response.status_code, response.text[:300])
        return False

    logger.info("Posted to X.")
    return True


# ---------------------------------------------------------------------------
# Facebook Page
# ---------------------------------------------------------------------------
def post_to_facebook(post: Post) -> bool:
    page_id = os.environ.get("FACEBOOK_PAGE_ID", "").strip()
    token = os.environ.get("FACEBOOK_PAGE_TOKEN", "").strip()
    if not (page_id and token):
        logger.info("Facebook not configured; skipping.")
        return False

    payload: dict[str, Any] = {"message": post.for_meta(), "access_token": token}
    if post.link:
        payload["link"] = post.link

    try:
        response = requests.post(f"{GRAPH_BASE}/{page_id}/feed", data=payload, timeout=TIMEOUT)
    except requests.RequestException as exc:
        logger.warning("Facebook post failed: %s", exc)
        return False

    if response.status_code != 200:
        logger.warning(
            "Facebook rejected the post (%s): %s", response.status_code, response.text[:300]
        )
        return False

    logger.info("Posted to the Facebook Page.")
    return True


# ---------------------------------------------------------------------------
# Instagram
# ---------------------------------------------------------------------------
def post_to_instagram(post: Post) -> bool:
    """Two calls: create a media container, then publish it.

    Instagram cannot be handed image bytes. It fetches `image_url` itself, so
    the card has to be publicly reachable, which is what /og is for.
    """
    user_id = os.environ.get("INSTAGRAM_USER_ID", "").strip()
    token = os.environ.get("FACEBOOK_PAGE_TOKEN", "").strip()
    if not (user_id and token):
        logger.info("Instagram not configured; skipping.")
        return False
    if not post.image_url:
        logger.info("Instagram needs an image; skipping this post.")
        return False

    try:
        created = requests.post(
            f"{GRAPH_BASE}/{user_id}/media",
            data={
                "image_url": post.image_url,
                "caption": post.for_meta(),
                "access_token": token,
            },
            timeout=TIMEOUT,
        )
    except requests.RequestException as exc:
        logger.warning("Instagram container failed: %s", exc)
        return False

    if created.status_code != 200:
        logger.warning(
            "Instagram rejected the container (%s): %s",
            created.status_code,
            created.text[:300],
        )
        return False

    creation_id = created.json().get("id")
    if not creation_id:
        logger.warning("Instagram returned no creation id.")
        return False

    # The container is not ready the instant it is created.
    time.sleep(5)

    try:
        published = requests.post(
            f"{GRAPH_BASE}/{user_id}/media_publish",
            data={"creation_id": creation_id, "access_token": token},
            timeout=TIMEOUT,
        )
    except requests.RequestException as exc:
        logger.warning("Instagram publish failed: %s", exc)
        return False

    if published.status_code != 200:
        logger.warning(
            "Instagram rejected the publish (%s): %s",
            published.status_code,
            published.text[:300],
        )
        return False

    logger.info("Posted to Instagram.")
    return True


# ---------------------------------------------------------------------------
# fan out
# ---------------------------------------------------------------------------
def broadcast(post: Post) -> dict[str, bool]:
    """Post everywhere that is configured. Never raises."""
    results: dict[str, bool] = {}
    for name, sender in (
        ("x", post_to_x),
        ("facebook", post_to_facebook),
        ("instagram", post_to_instagram),
    ):
        try:
            results[name] = sender(post)
        except Exception as exc:  # noqa: BLE001 - a post is never worth a job
            logger.warning("%s post raised: %s", name, exc)
            results[name] = False
    return results


def is_enabled() -> bool:
    return bool(
        _x_credentials()
        or (os.environ.get("FACEBOOK_PAGE_ID") and os.environ.get("FACEBOOK_PAGE_TOKEN"))
    )


# ---------------------------------------------------------------------------
# post builders
# ---------------------------------------------------------------------------
def _fmt(value: Any, digits: int = 2) -> str:
    try:
        return f"{float(value):,.{digits}f}"
    except (TypeError, ValueError):
        return str(value or "")


def brief_post(brief: dict[str, Any], movers: dict[str, list[dict[str, Any]]] | None = None) -> Post:
    """The morning headline, or the closing scoreboard when movers are given."""
    date = str(brief.get("brief_date", ""))
    closing = brief.get("session") == "closing"
    index_value = brief.get("index_value")
    index_change = brief.get("index_change_pct")

    lines: list[str] = []
    if closing and index_value:
        arrow = "up" if (index_change or 0) >= 0 else "down"
        lines.append(
            f"KSE-100 closed at {_fmt(index_value)}, {arrow} {abs(index_change or 0):.2f}%."
        )
    elif index_value:
        lines.append(f"KSE-100 {_fmt(index_value)} ({(index_change or 0):+.2f}%)")

    lines.append(str(brief.get("headline", "")).strip())

    if movers:
        for label, key in (("Gainers", "gainers"), ("Losers", "losers")):
            rows = (movers.get(key) or [])[:3]
            if not rows:
                continue
            parts = [
                f"{row.get('symbol')} {float(row.get('change_pct') or 0):+.1f}%" for row in rows
            ]
            lines.append(f"{label}  " + " | ".join(parts))

    lines.append(DISCLAIMER)

    return Post(
        text="\n\n".join(line for line in lines if line),
        link=f"{SITE_URL}/brief/{date}" if date else SITE_URL,
        image_url=card_url(type="brief", date=date) if date else card_url(type="site"),
        hashtags=["#PSX", "#KSE100", "#PakistanStockExchange"],
    )


def stock_post(stock: dict[str, Any]) -> Post:
    """A single company's close, which is the post format people screenshot."""
    symbol = str(stock.get("symbol", "")).upper()
    change = float(stock.get("change_pct") or 0)
    direction = "up" if change >= 0 else "down"

    lines = [
        f"{symbol} closed at {_fmt(stock.get('current_price'))}, {direction} {abs(change):.2f}% today.",
        "",
        f"Shariah: {'compliant (KMI All Shares)' if stock.get('is_kmi') else 'not in the KMI index'}",
    ]
    if stock.get("rsi_14") is not None:
        lines.append(f"RSI {_fmt(stock.get('rsi_14'), 1)}")
    if stock.get("low_52w") and stock.get("high_52w"):
        lines.append(
            f"52-week range: {_fmt(stock.get('low_52w'))} - {_fmt(stock.get('high_52w'))}"
        )
    if stock.get("sector_name"):
        lines.append(f"Sector: {stock['sector_name']}")
    lines += ["", DISCLAIMER]

    return Post(
        text="\n".join(lines),
        link=f"{SITE_URL}/stock/{symbol}",
        image_url=card_url(type="stock", symbol=symbol),
        hashtags=["#PSX", "#KSE100", f"#{symbol}", "#ShariahCompliant"],
    )


def picks_post(picks: list[dict[str, Any]], *, horizon: str, pick_date: str) -> Post:
    label = {"daily": "Short term", "monthly": "Medium term", "yearly": "Long term"}.get(
        horizon, horizon.title()
    )

    lines = [f"Top Shariah-compliant picks - {label} - {pick_date}", ""]
    for pick in picks[:5]:
        lines.append(f"{pick.get('symbol')}  {pick.get('current_price')}  ({pick.get('sector')})")
    lines += [
        "",
        "Screened against the KMI All Shares Islamic Index, not guessed by an AI.",
        DISCLAIMER,
    ]

    return Post(
        text="\n".join(lines),
        link=f"{SITE_URL}/picks",
        image_url=card_url(type="site"),
        hashtags=["#PSX", "#ShariahCompliant", "#IslamicFinance"],
    )


def track_record_post(board: dict[str, Any], positions: list[dict[str, Any]]) -> Post:
    """The weekly post. Publishing the losers is the whole differentiator."""
    lines = ["Our Shariah-compliant picks, marked to market. All of them, winners and losers.", ""]

    ranked = sorted(positions, key=lambda row: row.get("return_pct") or 0, reverse=True)
    # Show the top four and the bottom two rather than a straight top six, so
    # the post cannot be read as a highlight reel.
    shown = ranked[:4] + ranked[-2:] if len(ranked) > 6 else ranked[:6]
    for row in shown:
        lines.append(f"{row.get('symbol')}  {float(row.get('return_pct') or 0):+.1f}%")

    total = board.get("total") or 0
    if total:
        lines += [
            "",
            f"{board.get('hit_rate')}% of {total} tracked picks are in profit, "
            f"average {float(board.get('avg_return') or 0):+.1f}%.",
        ]
    lines += ["", DISCLAIMER]

    return Post(
        text="\n".join(lines),
        link=f"{SITE_URL}/track-record",
        image_url=card_url(type="site"),
        hashtags=["#PSX", "#ShariahCompliant", "#KSE100"],
    )
