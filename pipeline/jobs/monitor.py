"""Fail loudly when the pipeline stops.

This job exists because of the single most expensive failure in this project's
history: Render's free tier ended, the cron died, and the site served stale
July prices for eight weeks. Nobody noticed, because a dead cron and a working
one look identical from the outside. Nothing here collects new data. It reads
the newest timestamp of every kind of content, compares each against what the
trading calendar says it should be, alerts Telegram, and exits non-zero so the
Actions run turns red and GitHub emails about it.

    python -m pipeline.run monitor

Thresholds are expressed against the last completed trading session rather than
in flat hours, because PSX does not trade at the weekend and a flat "stale
after 24 hours" rule cries wolf every Saturday.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta

from pipeline import db, notify
from pipeline.config import PKT, SITE_URL

logger = logging.getLogger("smartsarmaya.monitor")

# A session is treated as complete once the market has closed and the pipeline
# has had an hour to run against it. PSX closes at 15:30 PKT.
SESSION_COMPLETE_HOUR = 17

# Content that is not tied to a single session, in days.
NOTE_MAX_AGE_DAYS = 4
EVENT_MAX_AGE_DAYS = 3


def _last_completed_session(now: datetime) -> date:
    """The most recent weekday whose close has passed."""
    day = now
    for _ in range(10):
        if day.weekday() < 5:
            complete = day.date() < now.date() or now.hour >= SESSION_COMPLETE_HOUR
            if complete:
                return day.date()
        day -= timedelta(days=1)
    return now.date()


def _as_date(value: object) -> date | None:
    if isinstance(value, datetime):
        return value.astimezone(PKT).date()
    if isinstance(value, date):
        return value
    return None


def _age_days(value: object, today: date) -> int | None:
    seen = _as_date(value)
    return None if seen is None else (today - seen).days


def run() -> dict[str, object]:
    db.init_db()
    now = datetime.now(PKT)
    today = now.date()
    session_day = _last_completed_session(now)
    state = db.freshness()

    problems: list[str] = []
    report: dict[str, object] = {
        "checked_at": now.isoformat(),
        "last_trading_session": session_day.isoformat(),
    }

    # Prices. This is the check that would have caught the eight weeks.
    quote_day = _as_date(state.get("quote_at"))
    report["quote_date"] = quote_day.isoformat() if quote_day else None
    if quote_day is None:
        problems.append("No quotes in the database at all.")
    elif quote_day < session_day:
        problems.append(
            f"Prices are stale: newest quote is {quote_day}, "
            f"but {session_day} has already closed."
        )

    # The brief and the picks are both weekday jobs.
    brief_day = _as_date(state.get("brief_date"))
    report["brief_date"] = brief_day.isoformat() if brief_day else None
    if brief_day is None:
        problems.append("No market brief has ever been published.")
    elif brief_day < session_day:
        problems.append(f"No brief for {session_day}; newest is {brief_day}.")

    pick_day = _as_date(state.get("pick_date"))
    report["pick_date"] = pick_day.isoformat() if pick_day else None
    if pick_day is None:
        problems.append("No picks have ever been published.")
    elif pick_day < session_day:
        problems.append(f"No picks for {session_day}; newest are from {pick_day}.")

    # Technicals run once a day after the close, so one missed run is tolerable.
    tech_age = _age_days(state.get("tech_at"), today)
    report["technicals_age_days"] = tech_age
    if tech_age is None:
        problems.append("No technical indicators have ever been computed.")
    elif tech_age > 3:
        problems.append(f"Technical indicators are {tech_age} days old.")

    # Stock notes rotate through the universe, so they lag by design.
    note_age = _age_days(state.get("note_at"), today)
    report["notes_age_days"] = note_age
    if note_age is not None and note_age > NOTE_MAX_AGE_DAYS:
        problems.append(f"Stock notes are {note_age} days old.")

    event_age = _age_days(state.get("event_at"), today)
    report["events_age_days"] = event_age
    if event_age is not None and event_age > EVENT_MAX_AGE_DAYS:
        problems.append(f"Dividends and corporate events are {event_age} days old.")

    report["problems"] = problems

    if not problems:
        logger.info(
            "Everything is current as of the %s session: quotes %s, brief %s, picks %s.",
            session_day, quote_day, brief_day, pick_day,
        )
        return report

    for problem in problems:
        logger.error("%s", problem)

    lines = [
        "<b>SmartSarmaya pipeline alert</b>",
        f"<i>Checked {now.strftime('%d %b %Y %H:%M')} PKT</i>",
        "",
    ]
    lines += [f"• {problem}" for problem in problems]
    lines += [
        "",
        "Check the Actions tab. If the workflow list is empty, GitHub disabled "
        "the schedule after 60 days of repository inactivity; push a commit to "
        "re-enable it.",
        "",
        f'<a href="{SITE_URL}">{SITE_URL}</a>',
    ]
    notify.send("\n".join(lines), disable_preview=True)

    # A non-zero exit turns the Actions run red, which is the other half of the
    # alert: GitHub emails on a failed scheduled workflow even if Telegram is
    # not configured.
    raise RuntimeError("; ".join(problems))
