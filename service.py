"""
Stateless orchestration for the PSX FastAPI backend.
"""

import logging
import os
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

from ai_agent import (
    SINGLE_STOCK_CACHE_TTL_SECONDS,
    TOP_PICKS_CACHE_KEY,
    TOP_PICKS_CACHE_TTL_SECONDS,
    apply_live_prices_to_top_picks_result,
    build_holdings_from_rows,
    build_risk_summary,
    collect_symbols_from_top_picks_result,
    generate_portfolio_html,
    generate_single_stock_deep_dive,
    generate_top_picks_with_live_prices,
    get_ai_cached,
    select_top_pick_symbols,
    set_ai_cached,
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
    fetch_psx_kse100_quote_map,
    format_news_for_prompt,
    format_portfolio_summary_for_prompt,
    normalize_psx_symbols,
    search_psx_symbols,
    shares_to_portfolio,
)

DEFAULT_MODEL = "llama-3.1-8b-instant"
PKT = ZoneInfo("Asia/Karachi")
logger = logging.getLogger("smartsarmaya.service")
TOP_PICKS_FALLBACK_SYMBOLS = ["OGDC", "PPL", "LUCK", "HUBC", "MEBL"]


def load_api_config() -> dict[str, str | None]:
    """Load API credentials from environment variables."""
    load_dotenv()

    groq_api_key = (os.environ.get("GROQ_API_KEY") or "").strip()
    gemini_api_key = (os.environ.get("GEMINI_API_KEY") or "").strip() or None
    model_name = (os.environ.get("AI_MODEL_NAME") or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    telegram_bot_token = (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()

    if not groq_api_key:
        raise ValueError("Missing required environment variable: GROQ_API_KEY")
    if not telegram_bot_token:
        logger.warning("TELEGRAM_BOT_TOKEN is not set (optional for API endpoints).")

    return {
        "groq_api_key": groq_api_key,
        "gemini_api_key": gemini_api_key,
        "model_name": model_name,
    }


def _report_date() -> str:
    return datetime.now(PKT).strftime("%A, %d %B %Y")


def _resolve_live_prices_for_symbols(symbols: list[str]) -> dict[str, float | None]:
    """Fetch live PSX prices with TradingView + per-symbol PSX + KSE-100 bulk fallback."""
    if not symbols:
        return {}
    prices = fetch_live_prices_for_symbols(symbols)
    kse100_quotes = fetch_psx_kse100_quote_map()
    for symbol in symbols:
        if prices.get(symbol) is not None:
            continue
        quote = kse100_quotes.get(symbol)
        if quote and quote.get("current", 0) > 0:
            prices[symbol] = float(quote["current"])
    return prices


def _refresh_top_picks_live_prices(result: dict[str, Any]) -> dict[str, Any]:
    """Re-apply fresh PSX prices to all pick horizons."""
    symbols = collect_symbols_from_top_picks_result(result)
    if not symbols:
        return result
    try:
        live_prices = _resolve_live_prices_for_symbols(symbols)
    except Exception as exc:
        logger.warning("Failed to refresh top-picks live prices: %s", exc)
        return result
    return apply_live_prices_to_top_picks_result(result, live_prices)


def analyze_portfolio(shares: list[dict[str, Any]]) -> dict[str, Any]:
    """Fetch market data for the given shares and return structured AI report data."""
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
        groq_api_key=config["groq_api_key"],
        model_name=config["model_name"],
        report_date=report_date,
        technical_text=technical_text,
        technical_rows=enriched_rows,
        portfolio_summary_text=portfolio_summary_text,
        portfolio_summary=portfolio_summary,
        news=news,
        news_text=news_text,
        psx_events=client_psx_events,
        gemini_api_key=config["gemini_api_key"],
    )

    return {
        "report_html": report_html,
        "report_date": report_date,
        "holdings": build_holdings_from_rows(enriched_rows),
        "risk_summary": build_risk_summary(portfolio_summary),
    }


def generate_top_picks() -> dict[str, Any]:
    """Generate top picks using symbol-selection -> live price -> final AI pass."""
    cached = get_ai_cached(TOP_PICKS_CACHE_KEY, TOP_PICKS_CACHE_TTL_SECONDS)
    if cached is not None:
        logger.info("Serving top picks from AI cache (%s).", TOP_PICKS_CACHE_KEY)
        return _refresh_top_picks_live_prices(cached)

    config = load_api_config()
    report_date = _report_date()
    news = fetch_pakistan_news(limit=10)
    news_text = format_news_for_prompt(news)
    try:
        symbols = select_top_pick_symbols(
            groq_api_key=config["groq_api_key"],
            model_name=config["model_name"],
            report_date=report_date,
            news_text=news_text,
            gemini_api_key=config["gemini_api_key"],
        )
    except Exception as exc:
        logger.exception("Top-picks symbol selection failed: %s", exc)
        symbols = TOP_PICKS_FALLBACK_SYMBOLS.copy()
        logger.warning("Using fallback top-pick symbols due to AI quota/error: %s", symbols)
    logger.info("AI symbol selection raw result: %s", symbols)
    cleaned_symbols = normalize_psx_symbols(symbols)
    if len(cleaned_symbols) < 5:
        logger.warning(
            "Top-pick symbol selection produced fewer than 5 valid symbols: %s. "
            "Falling back to defaults.",
            cleaned_symbols,
        )
        cleaned_symbols = TOP_PICKS_FALLBACK_SYMBOLS.copy()

    cleaned_symbols = cleaned_symbols[:5]
    try:
        live_prices = _resolve_live_prices_for_symbols(cleaned_symbols)
    except Exception as exc:
        logger.exception("Top-picks live price fetch failed: %s", exc)
        live_prices = {symbol: None for symbol in cleaned_symbols}
    logger.info("Fetched Live Prices: %s", live_prices)

    result = generate_top_picks_with_live_prices(
        groq_api_key=config["groq_api_key"],
        model_name=config["model_name"],
        report_date=report_date,
        news=news,
        news_text=news_text,
        recommended_symbols=cleaned_symbols,
        live_prices=live_prices,
        gemini_api_key=config["gemini_api_key"],
    )
    result = _refresh_top_picks_live_prices(result)
    set_ai_cached(TOP_PICKS_CACHE_KEY, result)
    return result


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
    """Analyze a single PSX stock with live data and Groq structured deep-dive."""
    normalized_symbol = symbol.strip().upper()
    if not normalized_symbol:
        raise ValueError("Symbol is required.")

    cache_key = f"single_stock:{normalized_symbol}"
    cached = get_ai_cached(cache_key, SINGLE_STOCK_CACHE_TTL_SECONDS)
    if cached is not None:
        logger.info("Serving single-stock analysis from AI cache (%s).", cache_key)
        return cached

    config = load_api_config()
    market = fetch_live_prices_for_symbols([normalized_symbol]).get(normalized_symbol)
    indicators = fetch_market_indicators({normalized_symbol}).get(normalized_symbol, {})
    current_price = market if market is not None else indicators.get("current_price")
    if current_price is None:
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

    result = generate_single_stock_deep_dive(
        groq_api_key=config["groq_api_key"],
        model_name=config["model_name"],
        report_date=_report_date(),
        symbol=normalized_symbol,
        current_price=current_price,
        rsi=rsi,
        support_1=support_1,
        resistance_1=resistance_1,
        news_text=news_text,
        gemini_api_key=config["gemini_api_key"],
    )
    set_ai_cached(cache_key, result)
    return result
