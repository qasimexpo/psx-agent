"""Quick API smoke tests."""

import sys

from ai_agent import _build_fallback_report, _build_fallback_top_picks_html
from fetchers import (
    build_client_report_data,
    build_market_data_cache,
    shares_to_portfolio,
)


def main() -> int:
    print("=== Test 1: shares_to_portfolio ===")
    shares = [
        {"symbol": "OGDC", "buy_price": 300.0, "quantity": 1000},
        {"symbol": "LUCK", "buy_price": 450.0, "quantity": 500},
        {"symbol": "FAKE", "buy_price": 100.0, "quantity": 100},
    ]
    portfolio = shares_to_portfolio(shares)
    assert len(portfolio) == 3
    assert portfolio["OGDC"]["buy_price"] == 300.0
    assert portfolio["OGDC"]["sector"] == "E&P"
    assert portfolio["LUCK"]["sector"] == "Cement"
    assert portfolio["FAKE"]["sector"] == "General"
    print(f"Parsed {len(portfolio)} holding(s) with sector mapping")

    print("=== Test 2: Market cache ===")
    symbols = set(portfolio.keys())
    cache = build_market_data_cache(symbols)
    pe_count = sum(
        1 for f in cache["fundamentals"].values() if f.get("pe_ratio") != "N/A"
    )
    print(
        f"Technicals: {len(cache['technicals'])}, "
        f"Fundamentals: {pe_count}/{len(cache['fundamentals'])}"
    )

    print("=== Test 3: Client report data ===")
    _, _, summary, _ = build_client_report_data(portfolio, cache)
    value = summary["total_portfolio_value_pkr"]
    pl = summary["total_unrealized_pl_pkr"]
    warnings = len(summary["risk_warnings"])
    print(f"  value=Rs.{value:,.0f}, P/L=Rs.{pl:,.0f}, warnings={warnings}")

    print("=== Test 4: Fallback portfolio HTML ===")
    report = _build_fallback_report(
        "Investor",
        "08 July 2026",
        [],
        [],
        {"portfolio_events": {}},
        {
            "total_portfolio_value_pkr": 0,
            "total_unrealized_pl_pkr": 0,
            "sector_allocation": {},
            "risk_warnings": [],
        },
    )
    assert "Assalamu Alaikum" in report["html_email"]
    assert "Investor" in report["html_email"]
    assert "Top 5" not in report["html_email"]
    assert "News Summary" not in report["html_email"]
    assert "Dividends" not in report["html_email"]
    print("  Portfolio fallback OK (no redundant sections)")

    print("=== Test 5: Fallback top picks HTML ===")
    top_picks_html = _build_fallback_top_picks_html("08 July 2026", [])
    assert "Daily Top 5 Picks" in top_picks_html
    assert "Weekly Top 5 Picks" in top_picks_html
    assert "Monthly Top 5 Picks" in top_picks_html
    print("  Top picks fallback OK")

    print("All unit tests passed.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"TEST FAILED: {exc}", file=sys.stderr)
        sys.exit(1)
