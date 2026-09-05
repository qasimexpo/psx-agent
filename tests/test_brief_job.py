"""The brief job, exercised with a stubbed model.

The brief writes a public, dated page. Without this test the first time the
storage path ran would be in production, so it is covered here with the model
replaced by a fixed response.
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipeline import db  # noqa: E402
from pipeline.jobs import brief  # noqa: E402

MODEL_RESPONSE = {
    "headline": "KSE-100 holds 175,000 as refinery volumes lead the session",
    "summary": "The benchmark closed higher for a fourth session in five.",
    "key_points": ["Refineries led turnover.", "Cement breadth was positive."],
    "body_html": "<p>The index added 399 points.</p><p>Cement led the breadth.</p>",
    "symbols": ["luck", "ogdc", ""],
}


@pytest.fixture()
def seeded_db(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'brief.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    db.configure_engine(url)
    db.Base.metadata.create_all(bind=db.get_engine())

    db.upsert_index_snapshot(
        name="KSE100",
        day=date(2026, 9, 5),
        value=175328.82,
        change=399.14,
        change_pct=0.23,
        sparkline=[175000.0, 175328.82],
    )
    db.replace_news(
        [
            {
                "region": "pakistan",
                "title": "PSX closes higher",
                "snippet": "Benchmark up",
                "source": "Test Wire",
                "link": "https://example.com/a",
                "published_at": None,
            }
        ]
    )
    # Telegram must stay off so the test never makes a network call.
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_CHANNEL_ID", raising=False)
    monkeypatch.setattr(brief.llm, "is_configured", lambda: True)
    yield


def test_brief_is_stored_and_readable(seeded_db, monkeypatch):
    monkeypatch.setattr(
        brief.llm, "complete_json", lambda system, user, **kwargs: (MODEL_RESPONSE, "test-model")
    )

    result = brief.run(session_name="closing")
    assert result["session"] == "closing"
    assert result["headline"] == MODEL_RESPONSE["headline"]
    assert result["telegram"] is False, "Telegram should be skipped when unconfigured"

    from sqlalchemy import select

    with db.session_scope() as session:
        row = session.execute(select(db.DailyBrief)).scalar_one()

    assert row.session == "closing"
    assert row.body_html.startswith("<p>")
    assert row.key_points == MODEL_RESPONSE["key_points"]
    assert row.symbols == ["LUCK", "OGDC"], "Symbols should be upper-cased and blanks dropped"
    assert row.index_value == pytest.approx(175328.82)
    assert row.model_used == "test-model"


def test_running_twice_in_a_day_updates_rather_than_duplicates(seeded_db, monkeypatch):
    monkeypatch.setattr(
        brief.llm, "complete_json", lambda system, user, **kwargs: (MODEL_RESPONSE, "test-model")
    )
    brief.run(session_name="closing")

    revised = {**MODEL_RESPONSE, "headline": "Revised headline after a late correction"}
    monkeypatch.setattr(
        brief.llm, "complete_json", lambda system, user, **kwargs: (revised, "test-model")
    )
    brief.run(session_name="closing")

    from sqlalchemy import func, select

    with db.session_scope() as session:
        count = session.execute(select(func.count()).select_from(db.DailyBrief)).scalar_one()
        row = session.execute(select(db.DailyBrief)).scalar_one()

    assert count == 1, "A second run created a duplicate row for the same session"
    assert row.headline == revised["headline"]


def test_empty_model_body_is_rejected(seeded_db, monkeypatch):
    """An empty brief must fail loudly rather than publish a blank page."""
    monkeypatch.setattr(
        brief.llm,
        "complete_json",
        lambda system, user, **kwargs: ({"headline": "x", "summary": "", "body_html": ""}, "m"),
    )

    with pytest.raises(RuntimeError, match="empty body"):
        brief.run(session_name="closing")


def test_unknown_session_is_rejected(seeded_db):
    with pytest.raises(ValueError, match="Unknown session"):
        brief.run(session_name="afternoon")
