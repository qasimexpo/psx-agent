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
    TOP_PICKS_COUNT,
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
from database import (
    DatabaseUnavailableError,
    get_all_tickers,
    get_news_and_events,
    get_top_picks_rows,
    parse_news_metadata,
)
from fetchers import (
    build_client_report_data,
    build_market_data_cache,
    fetch_fundamentals,
    fetch_kse100_index,
    fetch_live_prices_for_symbols,
    fetch_market_indicators,
    fetch_pakistan_news,
    fetch_psx_corporate_events,
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
TOP_PICKS_FALLBACK_SYMBOLS = ["OGDC", "PPL", "LUCK", "HUBC", "MEBL", "ENGRO"]


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


def _parse_change_float(change_value: str | float | int) -> float:
    try:
        return float(str(change_value).replace(",", "").strip())
    except (TypeError, ValueError):
        return 0.0


def _ticker_row_to_api(row: Any) -> dict[str, Any]:
    change = _parse_change_float(row.change)
    return {
        "symbol": row.symbol,
        "current_price": float(row.current_price or 0),
        "high": float(row.high or 0),
        "low": float(row.low or 0),
        "change": change,
        "direction": "UP" if change >= 0 else "DOWN",
    }


def _assemble_top_picks_from_rows(rows: list[Any]) -> dict[str, Any]:
    by_category = {row.category: row.ai_response_json for row in rows}
    daily = by_category.get("daily", {})
    monthly = by_category.get("monthly", {})
    yearly = by_category.get("yearly", {})
    report_html = (
        daily.get("report_html")
        or monthly.get("report_html")
        or yearly.get("report_html")
        or ""
    )
    return {
        "report_html": report_html,
        "daily_picks": daily.get("picks", []),
        "monthly_picks": monthly.get("picks", []),
        "yearly_picks": yearly.get("picks", []),
    }


def _db_ticker_price_map() -> dict[str, float]:
    """Fast live prices from Neon ticker snapshot."""
    try:
        rows = get_all_tickers()
    except DatabaseUnavailableError:
        return {}
    except Exception as exc:
        logger.warning("Could not load DB ticker prices: %s", exc)
        return {}

    prices: dict[str, float] = {}
    for row in rows:
        price = float(row.current_price or 0)
        if price > 0:
            prices[row.symbol] = price
    return prices


def _build_portfolio_market_cache(symbols: set[str]) -> dict[str, Any]:
    """Build portfolio market cache using DB prices first, then live fallbacks."""
    db_prices = _db_ticker_price_map()
    missing = sorted(symbol for symbol in symbols if symbol not in db_prices)

    if missing:
        live_prices = fetch_live_prices_for_symbols(missing)
        kse_quotes = fetch_psx_kse100_quote_map()
        for symbol in missing:
            live = live_prices.get(symbol)
            if live is not None and live > 0:
                db_prices[symbol] = float(live)
                continue
            quote = kse_quotes.get(symbol)
            if quote and quote.get("current", 0) > 0:
                db_prices[symbol] = float(quote["current"])

    technicals: dict[str, dict[str, Any]] = {}
    for symbol in symbols:
        price = db_prices.get(symbol)
        technicals[symbol] = {
            "current_price": price,
            "rsi": None,
            "volume": None,
            "r1": None,
            "s1": None,
            "error": None if price is not None else "Price unavailable",
        }

    symbols_missing_price = {
        symbol for symbol in symbols if technicals[symbol]["current_price"] is None
    }
    if symbols_missing_price:
        try:
            tv_indicators = fetch_market_indicators(symbols_missing_price)
            for symbol in symbols_missing_price:
                tv = tv_indicators.get(symbol, {})
                merged = dict(technicals[symbol])
                if tv.get("current_price") is not None:
                    merged["current_price"] = tv.get("current_price")
                    merged["error"] = tv.get("error")
                for field in ("rsi", "volume", "r1", "s1"):
                    if tv.get(field) is not None:
                        merged[field] = tv.get(field)
                if merged["current_price"] is not None:
                    merged["error"] = None
                technicals[symbol] = merged
        except Exception as exc:
            logger.warning("TradingView indicator enrichment skipped: %s", exc)

    return {
        "technicals": technicals,
        "fundamentals": fetch_fundamentals(symbols),
        "psx_events": fetch_psx_corporate_events(symbols),
    }


def analyze_portfolio(shares: list[dict[str, Any]]) -> dict[str, Any]:
    """Fetch market data for the given shares and return structured AI report data."""
    config = load_api_config()
    portfolio = shares_to_portfolio(shares)
    if not portfolio:
        raise ValueError("No valid shares provided.")

    report_date = _report_date()
    symbols = set(portfolio.keys())
    cache = _build_portfolio_market_cache(symbols)
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


def generate_top_picks_for_cron() -> dict[str, Any]:
    """Live Groq generation for cron job — not used by public GET endpoints."""
    config = load_api_config()
    report_date = _report_date()
    news = fetch_pakistan_news(limit=5)
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
    if len(cleaned_symbols) < TOP_PICKS_COUNT:
        logger.warning(
            "Top-pick symbol selection produced fewer than %s valid symbols: %s. "
            "Falling back to defaults.",
            TOP_PICKS_COUNT,
            cleaned_symbols,
        )
        cleaned_symbols = TOP_PICKS_FALLBACK_SYMBOLS.copy()

    cleaned_symbols = cleaned_symbols[:TOP_PICKS_COUNT]
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
    return _refresh_top_picks_live_prices(result)


def generate_top_picks(category: str | None = None) -> dict[str, Any]:
    """Read pre-generated top picks from Neon DB."""
    try:
        rows = get_top_picks_rows(category)
    except DatabaseUnavailableError:
        raise
    except Exception as exc:
        logger.exception("Failed to read top picks from database: %s", exc)
        raise DatabaseUnavailableError("Database is temporarily unavailable.") from exc

    if not rows:
        raise ValueError(
            "Top picks are not available yet. Please try again after the daily update runs."
        )

    if category:
        row = rows[0]
        payload = row.ai_response_json or {}
        return {
            "report_html": payload.get("report_html", ""),
            "daily_picks": payload.get("picks", []) if category == "daily" else [],
            "monthly_picks": payload.get("picks", []) if category == "monthly" else [],
            "yearly_picks": payload.get("picks", []) if category == "yearly" else [],
        }

    assembled = _assemble_top_picks_from_rows(rows)
    if not any(
        [
            assembled["daily_picks"],
            assembled["monthly_picks"],
            assembled["yearly_picks"],
        ]
    ):
        raise ValueError("Top picks data in database is incomplete.")
    return assembled


def get_news_and_events_api(
    *,
    limit: int = 50,
    event_type: str | None = None,
) -> list[dict[str, Any]]:
    """Read news and corporate events from Neon DB with parsed news metadata."""
    try:
        rows = get_news_and_events(limit=limit, event_type=event_type)
    except DatabaseUnavailableError:
        raise
    except Exception as exc:
        logger.exception("Failed to read news/events from database: %s", exc)
        raise DatabaseUnavailableError("Database is temporarily unavailable.") from exc

    items: list[dict[str, Any]] = []
    for row in rows:
        item: dict[str, Any] = {
            "id": row.id,
            "type": row.type,
            "title_or_symbol": row.title_or_symbol,
            "description": row.description,
            "link_or_date": row.link_or_date,
            "last_updated": row.last_updated,
            "snippet": None,
            "source": None,
            "region": None,
        }
        if row.type == "news":
            meta = parse_news_metadata(row.description)
            item["snippet"] = meta["snippet"]
            item["source"] = meta["source"]
            item["region"] = meta["region"]
        items.append(item)
    return items


def get_market_index() -> dict[str, Any]:
    """Fetch PSX KSE-100 index data for the market bar."""
    return fetch_kse100_index()


def get_market_ticker() -> list[dict[str, Any]]:
    """Read ticker snapshot from Neon DB."""
    try:
        rows = get_all_tickers()
    except DatabaseUnavailableError:
        raise
    except Exception as exc:
        logger.exception("Failed to read tickers from database: %s", exc)
        raise DatabaseUnavailableError("Database is temporarily unavailable.") from exc

    if not rows:
        raise ValueError(
            "Market ticker data is not available yet. Please try again after the next update."
        )
    return [_ticker_row_to_api(row) for row in rows]


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
        try:
            ticker_map = {row.get("symbol"): row for row in get_market_ticker()}
            ticker_row = ticker_map.get(normalized_symbol, {})
            ticker_price = ticker_row.get("current_price")
            if isinstance(ticker_price, (int, float)) and ticker_price > 0:
                current_price = float(ticker_price)
        except (DatabaseUnavailableError, ValueError):
            pass

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
