"""The safety guards around AI generated picks.

These cover the three defects that made the previous picks untrustworthy:
a model could name a stock that is not Shariah compliant, invent a ticker that
does not exist, and supply its own price. All three are now blocked before
anything reaches the database.
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipeline import db  # noqa: E402
from pipeline.jobs import picks  # noqa: E402


@pytest.fixture()
def sqlite_db(tmp_path, monkeypatch):
    """A throwaway database seeded with one compliant and one non-compliant stock."""
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'guards.db'}")
    db.configure_engine(f"sqlite:///{tmp_path / 'guards.db'}")
    db.Base.metadata.create_all(bind=db.get_engine())

    db.upsert_stocks(
        [
            {
                # Compliant, liquid, in the Cement sector.
                "symbol": "LUCK", "name": "Lucky Cement", "sector_code": "0804",
                "sector_name": "Cement", "is_kmi": True, "is_kmi30": True,
                "is_kse100": True, "is_etf": False, "is_debt": False,
                "current_price": 433.12, "change": 1.5, "change_pct": 0.35,
                "volume": 1_500_000, "avg_volume_30d": 1_400_000,
                "rsi_14": 41.9, "sma_50": 450.44, "sma_200": 443.66,
                "low_52w": 342.91, "high_52w": 512.70, "trend": "Downtrend",
                "signal": "CAUTION",
            },
            {
                "symbol": "DGKC", "name": "D.G. Khan Cement", "sector_code": "0804",
                "sector_name": "Cement", "is_kmi": True, "is_kmi30": False,
                "is_kse100": True, "is_etf": False, "is_debt": False,
                "current_price": 206.53, "change": -0.4, "change_pct": -0.19,
                "volume": 900_000, "avg_volume_30d": 850_000,
                "rsi_14": 52.0, "sma_50": 210.0, "sma_200": 190.0,
                "low_52w": 150.0, "high_52w": 240.0, "trend": "Sideways",
                "signal": "HOLD",
            },
            {
                # A conventional bank: never Shariah compliant, and in another sector.
                "symbol": "MCB", "name": "MCB Bank", "sector_code": "0807",
                "sector_name": "Commercial Banks", "is_kmi": False, "is_kmi30": False,
                "is_kse100": True, "is_etf": False, "is_debt": False,
                "current_price": 399.58, "change": 2.0, "change_pct": 0.5,
                "volume": 2_000_000, "avg_volume_30d": 1_900_000,
                "trend": "Uptrend", "signal": "HOLD",
            },
        ]
    )
    yield
    db.configure_engine(f"sqlite:///{tmp_path / 'guards.db'}")


def test_halal_universe_excludes_conventional_banks(sqlite_db):
    symbols = {row["symbol"] for row in db.halal_universe()}
    assert "LUCK" in symbols
    assert "DGKC" in symbols
    assert "MCB" not in symbols, "A non-KMI constituent leaked into the halal universe"


def test_candidates_are_restricted_to_the_sector(sqlite_db):
    candidates = picks._candidates_for("Cement")
    assert {row["symbol"] for row in candidates} == {"LUCK", "DGKC"}


def test_hallucinated_and_non_compliant_symbols_are_discarded(sqlite_db, monkeypatch):
    """The model returns a fake ticker, a non-compliant one, and a valid one."""

    def fake_complete_json(system, user, **kwargs):
        item = lambda sym: {  # noqa: E731 - compact test helper
            "symbol": sym,
            "summary": f"{sym} summary",
            "why": f"{sym} catalyst",
            "risk": f"{sym} risk",
        }
        return (
            {
                "daily": [item("NOTREAL"), item("MCB"), item("LUCK")],
                "monthly": [item("DGKC")],
                "yearly": [item("LUCK")],
            },
            "test-model",
        )

    monkeypatch.setattr(picks.llm, "complete_json", fake_complete_json)

    horizons, model_used = picks._generate_for_sector("Cement", "Friday, 05 September 2026", "no news")

    assert model_used == "test-model"
    daily_symbols = [pick["symbol"] for pick in horizons["daily"]]
    assert "NOTREAL" not in daily_symbols, "An invented ticker was accepted"
    assert "MCB" not in daily_symbols, "A non-compliant stock was accepted"
    assert "LUCK" in daily_symbols
    assert all(pick["halal_verified"] for pick in horizons["daily"])


def test_prices_come_from_the_database_not_the_model(sqlite_db, monkeypatch):
    def fake_complete_json(system, user, **kwargs):
        return (
            {
                "daily": [
                    {
                        "symbol": "LUCK",
                        "summary": "s",
                        "why": "w",
                        "risk": "r",
                        # A model trying to supply its own numbers.
                        "current_price": "999.99",
                        "buy_zone": "1 - 2",
                        "exit_target": "5000",
                    }
                ],
                "monthly": [],
                "yearly": [],
            },
            "test-model",
        )

    monkeypatch.setattr(picks.llm, "complete_json", fake_complete_json)
    horizons, _ = picks._generate_for_sector("Cement", "Friday, 05 September 2026", "no news")

    pick = horizons["daily"][0]
    assert pick["current_price"] == "433.12", "Model supplied price was not overwritten"
    assert "999" not in pick["exit_target"]
    assert "5000" not in pick["exit_target"]
    # Exit target is derived from the live price, so it sits above it.
    assert float(pick["exit_target"].replace(",", "")) > 433.12


def test_short_model_response_is_backfilled(sqlite_db, monkeypatch):
    """An empty horizon still produces picks rather than an empty section."""

    def fake_complete_json(system, user, **kwargs):
        return ({"daily": [], "monthly": [], "yearly": []}, "test-model")

    monkeypatch.setattr(picks.llm, "complete_json", fake_complete_json)
    horizons, _ = picks._generate_for_sector("Cement", "Friday, 05 September 2026", "no news")

    for horizon in ("daily", "monthly", "yearly"):
        assert len(horizons[horizon]) >= 2, f"{horizon} was left empty"
        assert all(pick["halal_verified"] for pick in horizons[horizon])


def test_exit_targets_widen_with_the_horizon(sqlite_db):
    _, daily_target = picks._derive_levels(100.0, "daily")
    _, monthly_target = picks._derive_levels(100.0, "monthly")
    _, yearly_target = picks._derive_levels(100.0, "yearly")

    assert float(daily_target) < float(monthly_target) < float(yearly_target)


def test_pick_tracking_records_entry_and_marks_to_market(sqlite_db):
    entry_day = date(2026, 9, 1)
    db.record_pick_entries(
        [
            {
                "symbol": "LUCK", "timeframe": "monthly", "sector": "Cement",
                "entry_date": entry_day, "entry_price": 400.0, "exit_target": 456.0,
                "last_price": 400.0, "return_pct": 0.0, "best_return_pct": 0.0,
                "days_held": 0, "status": "open",
            }
        ]
    )

    # Duplicate entries for the same day are ignored.
    db.record_pick_entries(
        [
            {
                "symbol": "LUCK", "timeframe": "monthly", "sector": "Cement",
                "entry_date": entry_day, "entry_price": 400.0, "exit_target": 456.0,
                "last_price": 400.0, "return_pct": 0.0, "best_return_pct": 0.0,
                "days_held": 0, "status": "open",
            }
        ]
    )

    result = db.refresh_pick_track({"LUCK": 440.0}, date(2026, 9, 11))
    assert result["updated"] == 1

    board = db.scorecard()
    assert board["total"] == 1, "Duplicate entry created a second tracked row"
    assert board["winners"] == 1
    assert board["avg_return"] == pytest.approx(10.0, abs=0.01)


def test_scorecard_settles_a_pick_that_hits_its_target(sqlite_db):
    db.record_pick_entries(
        [
            {
                "symbol": "DGKC", "timeframe": "daily", "sector": "Cement",
                "entry_date": date(2026, 9, 1), "entry_price": 200.0, "exit_target": 212.0,
                "last_price": 200.0, "return_pct": 0.0, "best_return_pct": 0.0,
                "days_held": 0, "status": "open",
            }
        ]
    )
    db.refresh_pick_track({"DGKC": 215.0}, date(2026, 9, 5))

    board = db.scorecard()
    assert board["targets_hit"] == 1
