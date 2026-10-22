"""Price alerts fire once, when a stored quote crosses the target."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipeline import db, mailer  # noqa: E402
from pipeline.jobs import market  # noqa: E402


@pytest.fixture()
def alerts_db(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'alerts.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    db.configure_engine(url)
    db.Base.metadata.create_all(bind=db.get_engine())
    db.upsert_stocks([{"symbol": "OGDC", "current_price": 300.0}, {"symbol": "LUCK", "current_price": 0.0}])
    with db.session_scope() as session:
        session.add_all(
            [
                db.PriceAlert(user_id="u1", email="a@example.com", symbol="OGDC", direction="above", target=290),
                db.PriceAlert(user_id="u1", email="a@example.com", symbol="OGDC", direction="above", target=320),
                db.PriceAlert(user_id="u2", email="b@example.com", symbol="OGDC", direction="below", target=305),
                db.PriceAlert(user_id="u2", email="b@example.com", symbol="LUCK", direction="below", target=1000),
            ]
        )


def alerts() -> list[db.PriceAlert]:
    with db.session_scope() as session:
        return list(session.execute(select(db.PriceAlert).order_by(db.PriceAlert.id)).scalars())


def test_alerts_fire_once_when_crossed(alerts_db):
    fired = db.trigger_price_alerts()
    assert sorted((a["direction"], a["target"]) for a in fired) == [("above", 290), ("below", 305)]
    assert [a.triggered_price for a in alerts()] == [300.0, None, 300.0, None]
    # A zero quote means no quote, so the LUCK alert waits.
    assert db.trigger_price_alerts() == []


def test_notified_is_stamped_only_for_sent_emails(alerts_db, monkeypatch):
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(mailer, "send", lambda to, subject, text: sent.append((to, subject)) or to == "a@example.com")
    fired = db.trigger_price_alerts()
    db.mark_alerts_notified(alert["id"] for alert in fired if market._email_alert(alert))
    assert sorted(sent) == [("a@example.com", "OGDC is above Rs 290.00"), ("b@example.com", "OGDC is below Rs 305.00")]
    assert [a.notified_at is not None for a in alerts()] == [True, False, False, False]


def test_mailer_does_nothing_without_smtp_settings():
    assert mailer.is_configured() is False
    assert mailer.send("a@example.com", "subject", "text") is False
