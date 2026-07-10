"""Unit tests for Neon DB read layer (SQLite in-memory)."""

import json
import os
import unittest
from unittest.mock import patch

from database import (
    DatabaseUnavailableError,
    configure_engine,
    get_all_tickers,
    get_database_url,
    get_top_picks_rows,
    init_db,
    parse_news_metadata,
    replace_news_and_events,
    upsert_ticker_rows,
    upsert_top_picks,
)
from service import _assemble_top_picks_from_rows, get_news_and_events_api


class TestDatabaseReads(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        configure_engine("sqlite:///:memory:")
        init_db()

    def test_upsert_ticker_row(self):
        count = upsert_ticker_rows(
            [
                {
                    "symbol": "EFERT",
                    "current_price": 195.68,
                    "high": 200.0,
                    "low": 190.0,
                    "change": 1.25,
                }
            ]
        )
        self.assertEqual(count, 1)
        rows = get_all_tickers()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].symbol, "EFERT")
        self.assertAlmostEqual(rows[0].current_price, 195.68)

        upsert_ticker_rows(
            [
                {
                    "symbol": "EFERT",
                    "current_price": 196.0,
                    "high": 201.0,
                    "low": 191.0,
                    "change": 2.0,
                }
            ]
        )
        rows = get_all_tickers()
        self.assertEqual(len(rows), 1)
        self.assertAlmostEqual(rows[0].current_price, 196.0)

    def test_top_picks_assembly(self):
        upsert_top_picks(
            "daily",
            {
                "picks": [{"symbol": "EFERT", "current_price": "195.68"}],
                "report_html": "<html>Daily</html>",
            },
        )
        upsert_top_picks(
            "monthly",
            {
                "picks": [{"symbol": "MARI", "current_price": "675.65"}],
                "report_html": "<html>Monthly</html>",
            },
        )
        upsert_top_picks(
            "yearly",
            {
                "picks": [{"symbol": "SYS", "current_price": "143.27"}],
                "report_html": "<html>Yearly</html>",
            },
        )
        rows = get_top_picks_rows()
        assembled = _assemble_top_picks_from_rows(rows)
        self.assertEqual(assembled["report_html"], "<html>Daily</html>")
        self.assertEqual(assembled["daily_picks"][0]["symbol"], "EFERT")
        self.assertEqual(assembled["monthly_picks"][0]["symbol"], "MARI")
        self.assertEqual(assembled["yearly_picks"][0]["symbol"], "SYS")

    def test_news_and_events_with_metadata(self):
        replace_news_and_events(
            [
                {
                    "type": "news",
                    "title_or_symbol": "PSX Rally",
                    "description": json.dumps(
                        {
                            "snippet": "Markets up",
                            "source": "Dawn",
                            "region": "pakistan",
                        }
                    ),
                    "link_or_date": "https://example.com/psx",
                },
                {
                    "type": "dividend",
                    "title_or_symbol": "OGDC",
                    "description": "Interim dividend announced",
                    "link_or_date": "2026-07-15",
                },
            ]
        )
        items = get_news_and_events_api()
        self.assertEqual(len(items), 2)
        news_item = next(item for item in items if item["type"] == "news")
        self.assertEqual(news_item["snippet"], "Markets up")
        self.assertEqual(news_item["region"], "pakistan")
        dividend_item = next(item for item in items if item["type"] == "dividend")
        self.assertEqual(dividend_item["title_or_symbol"], "OGDC")

    def test_parse_news_metadata_fallback(self):
        meta = parse_news_metadata('{"snippet":"x","source":"y","region":"global"}')
        self.assertEqual(meta["region"], "global")
        plain = parse_news_metadata("plain text")
        self.assertEqual(plain["snippet"], "plain text")

    @patch("database.load_dotenv")
    @patch.dict(os.environ, {}, clear=True)
    def test_database_url_missing_raises(self, _mock_load):
        with self.assertRaises(DatabaseUnavailableError):
            get_database_url()


if __name__ == "__main__":
    unittest.main()
