"""The technicals job keeps each symbol's daily closes for the site's charts."""

from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

import pytest
from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipeline import db  # noqa: E402
from pipeline.jobs import market  # noqa: E402


def series(days: int, start: float = 100.0) -> list[tuple[date, float, int]]:
    first = date(2025, 1, 1)
    return [(first + timedelta(days=i), start + i * 0.5, 1000) for i in range(days)]


@pytest.fixture()
def empty_db(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'history.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    db.configure_engine(url)
    db.Base.metadata.create_all(bind=db.get_engine())


def stored() -> dict[str, list]:
    with db.session_scope() as session:
        rows = session.execute(select(db.PriceHistory)).scalars().all()
        return {row.symbol: row.series for row in rows}


def test_history_row_keeps_the_last_year_as_iso_days():
    row = db.history_row("OGDC", series(300))
    assert len(row["series"]) == db.PRICE_HISTORY_DAYS
    assert row["series"][0] == ["2025-02-10", 120.0]
    assert row["series"][-1] == ["2025-10-27", 249.5]


def test_upsert_replaces_a_symbols_series(empty_db):
    db.upsert_price_history([db.history_row("OGDC", series(30))])
    db.upsert_price_history([db.history_row("OGDC", series(40, start=200.0))])
    assert len(stored()["OGDC"]) == 40
    assert stored()["OGDC"][0][1] == 200.0


def test_technicals_job_stores_history_only_for_symbols_with_enough_data(empty_db, monkeypatch):
    db.upsert_stocks([{"symbol": "OGDC"}, {"symbol": "NEWCO"}])
    monkeypatch.setattr(market, "covered_symbols", lambda: ["OGDC", "NEWCO"])
    monkeypatch.setattr(
        market.psx,
        "fetch_eod",
        lambda symbol, bulk=False: series(60) if symbol == "OGDC" else series(5),
    )

    result = market.run_technicals()

    assert result["updated"] == 1
    assert set(stored()) == {"OGDC"}
    assert len(stored()["OGDC"]) == 60
