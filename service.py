"""
Stateless orchestration for the PSX FastAPI backend.
"""

import os
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

from ai_agent import (
    build_holdings_from_rows,
    build_risk_summary,
    generate_single_stock_deep_dive,
    generate_portfolio_html,
    generate_top_picks_with_live_prices,
    select_top_pick_symbols,
)
from fetchers import (
    build_client_report_data,
    build_market_data_cache,
    fetch_dividend_calendar,
    fetch_kse100_index,
    fetch_live_prices_for_symbols,
    fetch_market_indicators,
    fetch_market_ticker,
    fetch_news_feeds,
    fetch_pakistan_news,
    format_news_for_prompt,
    format_portfolio_summary_for_prompt,
    normalize_psx_symbols,
    search_psx_symbols,
    shares_to_portfolio,
)

DEFAULT_MODEL = "gemini-2.5-flash"
PKT = ZoneInfo("Asia/Karachi")


def load_api_config() -> dict[str, str]:
    """Load API credentials from environment variables."""
    load_dotenv()

    gemini_api_key = os.getenv("GEMINI_API_KEY", "").strip()
    model_name = os.getenv("AI_MODEL_NAME", DEFAULT_MODEL).strip() or DEFAULT_MODEL

    if not gemini_api_key:
        raise ValueError("Missing required environment variable: GEMINI_API_KEY")

    return {
        "gemini_api_key": gemini_api_key,
        "model_name": model_name,
    }


def _report_date() -> str:
    return datetime.now(PKT).strftime("%A, %d %B %Y")


def analyze_portfolio(shares: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Fetch market data for the given shares and return structured AI report data.
    """
    config = load_api_config()
    portfolio = shares_to_portfolio(shares)
    if not portfolio:
        raise ValueError("No valid shares provided.")

    report_date = _report_date()
    symbols = set(portfolio.keys())
    cache = build_market_data_cache(symbols)
    enriched_rows, technical_text, portfolio_summary, client_psx_events = (
        build_client_report_data(portfolio, cache)
    )
    portfolio_summary_text = format_portfolio_summary_for_prompt(portfolio_summary)

    news = fetch_pakistan_news(limit=3)
    news_text = format_news_for_prompt(news)

    report_html = generate_portfolio_html(
        api_key=config["gemini_api_key"],
        model_name=config["model_name"],
        report_date=report_date,
        technical_text=technical_text,
        technical_rows=enriched_rows,
        portfolio_summary_text=portfolio_summary_text,
        portfolio_summary=portfolio_summary,
        news=news,
        news_text=news_text,
        psx_events=client_psx_events,
    )

    return {
        "report_html": report_html,
        "report_date": report_date,
        "holdings": build_holdings_from_rows(enriched_rows),
        "risk_summary": build_risk_summary(portfolio_summary),
    }


def generate_top_picks() -> dict[str, Any]:
    """Generate top picks using symbol-selection -> live price -> final AI pass."""
    config = load_api_config()
    report_date = _report_date()
    news = fetch_pakistan_news(limit=10)
    news_text = format_news_for_prompt(news)
    symbols = select_top_pick_symbols(
        api_key=config["gemini_api_key"],
        model_name=config["model_name"],
        report_date=report_date,
        news_text=news_text,
    )
    cleaned_symbols = normalize_psx_symbols(symbols)
    if len(cleaned_symbols) < 5:
        raise ValueError("Top picks symbol selection returned fewer than 5 valid symbols.")

    cleaned_symbols = cleaned_symbols[:5]
    live_prices_raw = fetch_live_prices_for_symbols(cleaned_symbols)
    live_prices = {symbol: live_prices_raw.get(symbol) for symbol in cleaned_symbols}

    return generate_top_picks_with_live_prices(
        api_key=config["gemini_api_key"],
        model_name=config["model_name"],
        report_date=report_date,
        news=news,
        news_text=news_text,
        recommended_symbols=cleaned_symbols,
        live_prices=live_prices,
    )


def get_news() -> dict[str, list[dict[str, str]]]:
    """Fetch Pakistan and global finance news feeds."""
    return fetch_news_feeds(pakistan_limit=5, global_limit=5)


def get_market_index() -> dict[str, Any]:
    """Fetch PSX KSE-100 index data for the market bar."""
    return fetch_kse100_index()


def get_market_ticker() -> list[dict[str, Any]]:
    """Fetch cached technical ticker data for top KSE-100 symbols."""
    return fetch_market_ticker()


def get_dividend_calendar() -> list[dict[str, str]]:
    """Fetch upcoming dividend and board-meeting events."""
    return fetch_dividend_calendar()


def get_symbol_suggestions(query: str, limit: int = 8) -> list[dict[str, str]]:
    """Return PSX symbol autocomplete suggestions."""
    return search_psx_symbols(query, limit=limit)


def analyze_single_stock(symbol: str) -> dict[str, str]:
    """
    Analyze a single PSX stock with strict two-step flow:
    1) fetch exact live TA data
    2) pass live data to Gemini for structured deep-dive
    """
    normalized_symbol = symbol.strip().upper()
    if not normalized_symbol:
        raise ValueError("Symbol is required.")

    config = load_api_config()
    market = fetch_live_prices_for_symbols([normalized_symbol]).get(normalized_symbol)
    indicators = fetch_market_indicators({normalized_symbol}).get(normalized_symbol, {})
    current_price = market if market is not None else indicators.get("current_price")
    if current_price is None:
        # Fallback to the market ticker snapshot when direct quote endpoints are rate-limited.
        ticker_map = {row.get("symbol"): row for row in fetch_market_ticker()}
        ticker_row = ticker_map.get(normalized_symbol, {})
        ticker_price = ticker_row.get("current_price")
        if isinstance(ticker_price, (int, float)) and ticker_price > 0:
            current_price = float(ticker_price)

    if current_price is None:
        raise ValueError(
            "Live market data is temporarily unavailable for this symbol. "
            "Please try again in a few minutes."
        )

    rsi = indicators.get("rsi")
    support_1 = indicators.get("s1")
    resistance_1 = indicators.get("r1")

    news = fetch_pakistan_news(limit=3)
    news_text = format_news_for_prompt(news)

    return generate_single_stock_deep_dive(
        api_key=config["gemini_api_key"],
        model_name=config["model_name"],
        report_date=_report_date(),
        symbol=normalized_symbol,
        current_price=current_price,
        rsi=rsi,
        support_1=support_1,
        resistance_1=resistance_1,
        news_text=news_text,
    )
