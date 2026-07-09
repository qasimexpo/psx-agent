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
    generate_portfolio_html,
    generate_top_picks_structured,
)
from fetchers import (
    build_client_report_data,
    build_market_data_cache,
    fetch_kse100_index,
    fetch_news_feeds,
    fetch_pakistan_news,
    format_news_for_prompt,
    format_portfolio_summary_for_prompt,
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
    """Fetch PSX news and return structured top picks data."""
    config = load_api_config()

    news = fetch_pakistan_news(limit=10)
    news_text = format_news_for_prompt(news)

    return generate_top_picks_structured(
        api_key=config["gemini_api_key"],
        model_name=config["model_name"],
        report_date=_report_date(),
        news=news,
        news_text=news_text,
    )


def get_news() -> dict[str, list[dict[str, str]]]:
    """Fetch Pakistan and global finance news feeds."""
    return fetch_news_feeds(pakistan_limit=5, global_limit=5)


def get_market_index() -> dict[str, Any]:
    """Fetch PSX KSE-100 index data for the market bar."""
    return fetch_kse100_index()


def get_symbol_suggestions(query: str, limit: int = 8) -> list[dict[str, str]]:
    """Return PSX symbol autocomplete suggestions."""
    return search_psx_symbols(query, limit=limit)
