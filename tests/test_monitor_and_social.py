"""The monitor's calendar arithmetic, and the length rule for X.

Both are things that look right and are wrong in a way nothing else notices.
A monitor that cries wolf every Saturday gets muted, and a muted monitor is
the same as no monitor, which is what cost eight weeks of stale data. A post
one character over the limit is rejected silently by X and the day's content
never goes out.
"""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipeline import social  # noqa: E402
from pipeline.config import PKT  # noqa: E402
from pipeline.jobs.monitor import _last_completed_session  # noqa: E402


def at(year: int, month: int, day: int, hour: int) -> datetime:
    return datetime(year, month, day, hour, tzinfo=PKT)


def test_session_is_today_only_after_the_close() -> None:
    # 4 September 2026 is a Friday.
    assert _last_completed_session(at(2026, 9, 4, 18)).isoformat() == "2026-09-04"
    # Mid-session on the same Friday, today's data is not due yet.
    assert _last_completed_session(at(2026, 9, 4, 11)).isoformat() == "2026-09-03"


def test_weekend_expects_fridays_session() -> None:
    """The rule that stops a flat 24-hour threshold alerting every Saturday."""
    assert _last_completed_session(at(2026, 9, 5, 9)).isoformat() == "2026-09-04"
    assert _last_completed_session(at(2026, 9, 6, 23)).isoformat() == "2026-09-04"
    # Monday before the close still expects Friday.
    assert _last_completed_session(at(2026, 9, 7, 9)).isoformat() == "2026-09-04"
    assert _last_completed_session(at(2026, 9, 7, 18)).isoformat() == "2026-09-07"


def _weighted_length(text: str) -> int:
    """X counts every URL as 23 characters, whatever its real length."""
    return sum(
        social.X_URL_WEIGHT if word.startswith("http") else len(word)
        for word in text.split()
    ) + text.count(" ") + text.count("\n")


def test_stock_post_fits_x() -> None:
    post = social.stock_post(
        {
            "symbol": "PSO",
            "current_price": 360.7,
            "change_pct": 0.28,
            "is_kmi": True,
            "rsi_14": 50.3,
            "low_52w": 328.69,
            "high_52w": 503.21,
            "sector_name": "Oil & Gas Marketing Companies",
        }
    )
    assert _weighted_length(post.for_x()) <= social.X_LIMIT
    assert "smartsarmaya.com/stock/PSO" in post.for_x()


def test_long_post_is_trimmed_but_keeps_its_link() -> None:
    post = social.Post(
        text="x" * 600,
        link="https://www.smartsarmaya.com/track-record",
        hashtags=["#PSX"],
    )
    rendered = post.for_x()
    assert _weighted_length(rendered) <= social.X_LIMIT
    assert rendered.endswith("https://www.smartsarmaya.com/track-record")


def test_every_post_carries_a_card_url() -> None:
    """Instagram can only publish an image it can fetch from a public URL."""
    post = social.picks_post(
        [{"symbol": "OGDC", "current_price": "205.10", "sector": "Energy (E&P)"}],
        horizon="daily",
        pick_date="5 September 2026",
    )
    assert post.image_url.startswith("http")
    assert "/og?" in post.image_url
