"""Unit tests for top-picks live price enforcement."""

import logging
import unittest
from unittest.mock import patch

from ai_agent import (
    _enforce_live_prices_on_pick_list,
    _expand_live_prices_for_result,
    _parse_pick_price,
    apply_live_prices_to_top_picks_result,
    collect_symbols_from_top_picks_result,
)


class TestParsePickPrice(unittest.TestCase):
    def test_strips_pkr_and_commas(self):
        self.assertEqual(_parse_pick_price("195.68 PKR"), 195.68)
        self.assertEqual(_parse_pick_price("1,600.00"), 1600.0)
        self.assertIsNone(_parse_pick_price("N/A"))
        self.assertIsNone(_parse_pick_price(""))


class TestEnforceLivePrices(unittest.TestCase):
    def test_overwrites_hallucinated_efert_price(self):
        picks = [{"symbol": "EFERT", "current_price": "80.0"}]
        enforced = _enforce_live_prices_on_pick_list(picks, {"EFERT": 195.68})
        self.assertEqual(enforced[0]["current_price"], "195.68")

    def test_overwrites_small_deviation_with_authoritative_price(self):
        picks = [{"symbol": "EFERT", "current_price": "194.00"}]
        enforced = _enforce_live_prices_on_pick_list(picks, {"EFERT": 195.68})
        self.assertEqual(enforced[0]["current_price"], "195.68")

    def test_logs_warning_for_large_hallucination(self):
        picks = [{"symbol": "MARI", "current_price": "1600.0"}]
        with self.assertLogs("smartsarmaya.ai", level="WARNING") as logs:
            enforced = _enforce_live_prices_on_pick_list(picks, {"MARI": 675.65})
        self.assertEqual(enforced[0]["current_price"], "675.65")
        self.assertTrue(
            any("LLM price hallucination for MARI" in record.message for record in logs.records)
        )

    def test_sets_na_when_live_price_missing(self):
        picks = [{"symbol": "SYS", "current_price": "550.0"}]
        enforced = _enforce_live_prices_on_pick_list(picks, {"SYS": None})
        self.assertEqual(enforced[0]["current_price"], "N/A")


class TestCollectSymbols(unittest.TestCase):
    def test_deduplicates_across_horizons(self):
        result = {
            "daily_picks": [{"symbol": "EFERT"}, {"symbol": "MARI"}],
            "monthly_picks": [{"symbol": "MARI"}, {"symbol": "SYS"}],
            "yearly_picks": [{"symbol": "SYS"}, {"symbol": "MEBL"}],
        }
        self.assertEqual(
            collect_symbols_from_top_picks_result(result),
            ["EFERT", "MARI", "SYS", "MEBL"],
        )


class TestApplyLivePrices(unittest.TestCase):
    def test_applies_to_all_horizons(self):
        result = {
            "report_html": "<html></html>",
            "daily_picks": [{"symbol": "EFERT", "current_price": "80.0"}],
            "monthly_picks": [{"symbol": "MARI", "current_price": "1600.0"}],
            "yearly_picks": [],
        }
        updated = apply_live_prices_to_top_picks_result(
            result,
            {"EFERT": 195.68, "MARI": 675.65},
        )
        self.assertEqual(updated["daily_picks"][0]["current_price"], "195.68")
        self.assertEqual(updated["monthly_picks"][0]["current_price"], "675.65")


class TestExpandLivePrices(unittest.TestCase):
    @patch("ai_agent.fetch_psx_kse100_quote_map", return_value={})
    @patch("ai_agent.fetch_live_prices_for_symbols", return_value={"MARI": 675.65})
    def test_uses_existing_and_fetches_missing(self, _mock_fetch, _mock_kse):
        result = {
            "daily_picks": [{"symbol": "EFERT"}],
            "monthly_picks": [{"symbol": "MARI"}],
            "yearly_picks": [],
        }
        expanded = _expand_live_prices_for_result(result, {"EFERT": 195.68})
        self.assertEqual(expanded["EFERT"], 195.68)
        self.assertEqual(expanded["MARI"], 675.65)


if __name__ == "__main__":
    unittest.main()
