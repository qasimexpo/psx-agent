"""
Data fetchers for PSX portfolio technicals, news, and corporate events.
"""

import json
import logging
import re
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, TypedDict
from zoneinfo import ZoneInfo

import feedparser
import requests
from bs4 import BeautifulSoup
from tradingview_ta import Interval, TA_Handler, get_multiple_analysis

logger = logging.getLogger("smartsarmaya.fetchers")

PAKISTAN_NEWS_URL = (
    "https://news.google.com/rss/search?"
    "q=Pakistan+Stock+Exchange+OR+State+Bank+Pakistan+Economy"
    "&hl=en-US&gl=US&ceid=US:en"
)
GLOBAL_FINANCE_NEWS_URL = (
    "https://news.google.com/rss/search?"
    "q=global+markets+OR+Federal+Reserve+OR+oil+prices"
    "&hl=en-US&gl=US&ceid=US:en"
)
PSX_PAYOUTS_URL = "https://dps.psx.com.pk/payouts"
PSX_ANNOUNCEMENTS_URL = "https://dps.psx.com.pk/announcements/companies"
PSX_SYMBOLS_URL = "https://dps.psx.com.pk/symbols"
PSX_KSE100_CONSTITUENTS_URL = "https://dps.psx.com.pk/indices/KSE100"
PSX_TIMESERIES_INT_URL = "https://dps.psx.com.pk/timeseries/int/{symbol}"

HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/91.0.4472.124 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

INVESTING_KSE100_URL = "https://www.investing.com/indices/kse-100"

_TV_ANALYSIS_CACHE: dict[str, tuple[dict[str, Any], float]] = {}
_TV_CACHE_TTL_SECONDS = 420
_TV_POST_CALL_DELAY = 1.5
_TV_RATE_LIMIT_BACKOFF = (5, 10)

_KSE100_INDEX_CACHE: tuple[dict[str, Any], float] | None = None
_KSE100_INDEX_CACHE_TTL_SECONDS = 180

BOARD_MEETING_KEYWORDS = (
    "board",
    "bod",
    "dividend",
    "payout",
    "book closure",
    "bonus",
    "right",
)

EVENT_WINDOW_PAST_DAYS = 15
EVENT_WINDOW_FUTURE_DAYS = 15
PKT = ZoneInfo("Asia/Karachi")

MONTHS = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}


class Holding(TypedDict):
    buy_price: float
    quantity: int
    sector: str
    buy_date: date | None


class ClientProfile(TypedDict):
    client_name: str
    email: str
    telegram_chat_id: str
    portfolio: str


REQUIRED_PROFILE_KEYS = ("client_name", "email", "telegram_chat_id", "portfolio")


def load_profiles(path: str = "profiles.json") -> list[ClientProfile]:
    """Load and validate client profiles from profiles.json."""
    profile_path = Path(path)
    if not profile_path.exists():
        raise FileNotFoundError(f"Profiles file not found: {profile_path}")

    with profile_path.open(encoding="utf-8") as handle:
        data = json.load(handle)

    raw_profiles = data.get("profiles")
    if not isinstance(raw_profiles, list) or not raw_profiles:
        raise ValueError("profiles.json must contain a non-empty 'profiles' array.")

    valid_profiles: list[ClientProfile] = []
    for index, entry in enumerate(raw_profiles, start=1):
        if not isinstance(entry, dict):
            print(f"Skipping profile #{index}: not an object.", file=sys.stderr)
            continue

        missing = [key for key in REQUIRED_PROFILE_KEYS if not str(entry.get(key, "")).strip()]
        if missing:
            print(
                f"Skipping profile #{index}: missing fields {', '.join(missing)}.",
                file=sys.stderr,
            )
            continue

        portfolio = parse_portfolio(str(entry["portfolio"]).strip())
        if not portfolio:
            print(
                f"Skipping profile #{index} ({entry.get('client_name', 'unknown')}): "
                "portfolio has no valid holdings.",
                file=sys.stderr,
            )
            continue

        valid_profiles.append(
            {
                "client_name": str(entry["client_name"]).strip(),
                "email": str(entry["email"]).strip(),
                "telegram_chat_id": str(entry["telegram_chat_id"]).strip(),
                "portfolio": str(entry["portfolio"]).strip(),
            }
        )

    if not valid_profiles:
        raise ValueError("No valid client profiles found in profiles.json.")

    return valid_profiles


def collect_unique_symbols(profiles: list[ClientProfile]) -> set[str]:
    """Return the union of all stock symbols across every client profile."""
    symbols: set[str] = set()
    for profile in profiles:
        portfolio = parse_portfolio(profile["portfolio"])
        symbols.update(portfolio.keys())
    return symbols


def _parse_buy_date(raw: str) -> date | None:
    """Parse ISO buy date (YYYY-MM-DD) from portfolio string."""
    text = raw.strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text)
    except ValueError:
        print(f"Invalid buy date (use YYYY-MM-DD): {raw}", file=sys.stderr)
        return None


def _compute_cgt_status(buy_date: date | None) -> tuple[int | None, str]:
    """Return holding days and CGT status from buy date."""
    if buy_date is None:
        return None, "N/A"
    holding_days = (date.today() - buy_date).days
    if holding_days < 365:
        return holding_days, "Short-Term (<1 Yr)"
    return holding_days, "Long-Term (>1 Yr)"


def shares_to_portfolio(shares: list[dict[str, Any]]) -> dict[str, Holding]:
    """Convert API share dicts to internal Holding map."""
    portfolio: dict[str, Holding] = {}
    for entry in shares:
        symbol = str(entry.get("symbol", "")).strip().upper()
        if not symbol:
            continue
        try:
            buy_price = float(entry["buy_price"])
            quantity = int(entry["quantity"])
        except (KeyError, TypeError, ValueError):
            continue
        if buy_price <= 0 or quantity <= 0:
            continue
        sector = str(entry.get("sector", "Unknown")).strip() or "Unknown"
        buy_date_raw = entry.get("buy_date")
        buy_date = _parse_buy_date(str(buy_date_raw)) if buy_date_raw else None
        portfolio[symbol] = {
            "buy_price": buy_price,
            "quantity": quantity,
            "sector": sector,
            "buy_date": buy_date,
        }
    return portfolio


def parse_portfolio(raw: str) -> dict[str, Holding]:
    """
    Parse PORTFOLIO env string into {symbol: Holding}.

    Format: SYMBOL:BUY_PRICE:QUANTITY:SECTOR:BUY_DATE
    Legacy 2-part (SYMBOL:BUY_PRICE) or 3-part entries default sector to
    Unknown and buy_date to None.
    """
    portfolio: dict[str, Holding] = {}
    for entry in raw.split(","):
        entry = entry.strip()
        if not entry:
            continue
        parts = entry.split(":")
        if len(parts) < 2:
            print(f"Skipping malformed portfolio entry: {entry}", file=sys.stderr)
            continue
        if len(parts) == 4:
            print(
                f"Skipping malformed portfolio entry (expected 5 parts): {entry}",
                file=sys.stderr,
            )
            continue

        symbol = parts[0].strip().upper()
        try:
            buy_price = float(parts[1].strip())
        except ValueError:
            print(
                f"Skipping invalid buy price for {symbol}: {parts[1]}",
                file=sys.stderr,
            )
            continue

        quantity = 1
        sector = "Unknown"
        buy_date: date | None = None

        if len(parts) >= 3:
            try:
                quantity = int(float(parts[2].strip()))
            except ValueError:
                print(
                    f"Skipping invalid quantity for {symbol}: {parts[2]}",
                    file=sys.stderr,
                )
                continue
        else:
            print(
                f"No quantity for {symbol}; defaulting to 1 share.",
                file=sys.stderr,
            )

        if len(parts) >= 5:
            sector = parts[3].strip().replace("_", " ") or "Unknown"
            buy_date = _parse_buy_date(parts[4].strip())
        elif len(parts) == 3:
            print(
                f"No sector/buy_date for {symbol}; CGT tracking unavailable.",
                file=sys.stderr,
            )

        if quantity <= 0:
            print(f"Skipping {symbol}: quantity must be positive.", file=sys.stderr)
            continue

        portfolio[symbol] = {
            "buy_price": buy_price,
            "quantity": quantity,
            "sector": sector,
            "buy_date": buy_date,
        }
    return portfolio


def _format_number(value: float | None, decimals: int = 2) -> str:
    if value is None:
        return "N/A"
    return f"{value:,.{decimals}f}"


def _format_volume(value: float | None) -> str:
    if value is None:
        return "N/A"
    return f"{value:,.0f}"


def _format_pkr(amount: float | None) -> str:
    """Format a PKR profit/loss amount with sign and thousands separators."""
    if amount is None:
        return "N/A"
    sign = "+" if amount >= 0 else "-"
    return f"{sign}Rs. {abs(amount):,.0f}"


def _build_technical_row(
    symbol: str,
    buy_price: float,
    quantity: int,
    current: float | None,
    rsi: float | None,
    volume: float | None,
    r1: float | None,
    s1: float | None,
    error: str | None = None,
) -> tuple[dict[str, Any], str]:
    """Build a structured technical row and its prompt text line."""
    pl_amount = None
    pl_pct = None
    if current is not None and buy_price:
        per_share_pl = current - buy_price
        pl_amount = per_share_pl * quantity
        pl_pct = (per_share_pl / buy_price) * 100

    row: dict[str, Any] = {
        "symbol": symbol,
        "buy_price": buy_price,
        "quantity": quantity,
        "current_price": current,
        "pl_amount": pl_amount,
        "pl_pct": pl_pct,
        "rsi": rsi,
        "volume": volume,
        "r1": r1,
        "s1": s1,
        "error": error,
    }

    pl_text = "N/A"
    if pl_amount is not None and pl_pct is not None:
        pl_text = f"{_format_pkr(pl_amount)} ({pl_pct:+.2f}%)"

    text_line = (
        f"{symbol} | Qty: {quantity:,} | Buy: {_format_number(buy_price)} | "
        f"Current: {_format_number(current)} | P/L: {pl_text} | "
        f"RSI: {_format_number(rsi)} | Vol: {_format_volume(volume)} | "
        f"R1: {_format_number(r1)} | S1: {_format_number(s1)}"
    )
    return row, text_line


def fetch_market_indicators(symbols: set[str]) -> dict[str, dict[str, Any]]:
    """
    Fetch TradingView market indicators once for a set of symbols.

    Returns per-symbol market data only (no client buy price, qty, or P/L).
    """
    if not symbols:
        return {}

    symbol_list = sorted(
        s for s in (normalize_psx_symbol(raw) or str(raw).strip().upper() for raw in symbols) if s
    )
    tv_symbols = [f"PSX:{ticker}" for ticker in symbol_list]
    results = _get_multiple_analysis_resilient(tv_symbols)

    indicators: dict[str, dict[str, Any]] = {}

    for symbol in symbol_list:
        symbol_key = f"PSX:{symbol}"
        data = results.get(symbol_key)
        if not data:
            data = _ta_handler_get_analysis_resilient(symbol)

        if data:
            indicators[symbol] = {
                "current_price": data.get("close"),
                "rsi": data.get("RSI"),
                "volume": data.get("volume"),
                "r1": data.get("Pivot.M.Classic.R1"),
                "s1": data.get("Pivot.M.Classic.S1"),
                "error": None,
            }
        else:
            indicators[symbol] = {
                "current_price": None,
                "rsi": None,
                "volume": None,
                "r1": None,
                "s1": None,
                "error": "Batch fetch failed",
            }

    return indicators


_LIVE_PRICE_CACHE: dict[str, tuple[float | None, float]] = {}
_LIVE_PRICE_CACHE_TTL_SECONDS = 120
_LIVE_PRICE_FAILURE_CACHE_TTL_SECONDS = 20


def normalize_psx_symbol(value: Any) -> str:
    """Normalize model/user symbol text into uppercase PSX ticker."""
    text = str(value).strip()
    text = text.strip("\"'`")
    text = re.sub(r"\s+", "", text)
    text = text.upper()
    if not re.fullmatch(r"[A-Z0-9]{2,12}", text):
        return ""
    return text


def normalize_psx_symbols(values: list[Any]) -> list[str]:
    """Normalize and de-duplicate PSX symbols while preserving order."""
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in values:
        symbol = normalize_psx_symbol(raw)
        if not symbol or symbol in seen:
            continue
        seen.add(symbol)
        normalized.append(symbol)
    return normalized


def _is_rate_limit_error(exc: Exception) -> bool:
    """Return True when TradingView signals HTTP 429 rate limiting."""
    return "429" in str(exc)


def _tv_symbol_key(symbol: str) -> str:
    """Build normalized TradingView symbol key (e.g. PSX:OGDC)."""
    if ":" in symbol:
        exchange, _, ticker = symbol.partition(":")
        cleaned = normalize_psx_symbol(ticker) or ticker.strip().upper()
        return f"{exchange.strip().upper()}:{cleaned}"
    cleaned = normalize_psx_symbol(symbol)
    return f"PSX:{cleaned}" if cleaned else symbol.strip().upper()


def _get_cached_tv_indicators(
    tv_symbols: list[str],
) -> tuple[dict[str, dict[str, Any]], list[str]]:
    """Return cached indicator dicts and symbols that still need a network fetch."""
    now = time.time()
    cached: dict[str, dict[str, Any]] = {}
    needed: list[str] = []
    for raw in tv_symbols:
        key = _tv_symbol_key(raw)
        entry = _TV_ANALYSIS_CACHE.get(key)
        if entry and now - entry[1] < _TV_CACHE_TTL_SECONDS:
            cached[key] = entry[0]
        elif key not in needed:
            needed.append(key)
    return cached, needed


def _store_tv_indicators_in_cache(tv_symbol: str, indicators: dict[str, Any]) -> None:
    """Store TradingView indicator payload in the shared in-memory cache."""
    key = _tv_symbol_key(tv_symbol)
    _TV_ANALYSIS_CACHE[key] = (indicators, time.time())


def _get_close_from_tv_cache(symbol: str, cache_ttl_seconds: int) -> float | None:
    """Read a cached close price for a PSX symbol when still fresh."""
    key = _tv_symbol_key(symbol)
    entry = _TV_ANALYSIS_CACHE.get(key)
    if not entry:
        return None
    indicators, cached_at = entry
    if time.time() - cached_at >= cache_ttl_seconds:
        return None
    close = indicators.get("close")
    if close is None:
        return None
    try:
        return float(close)
    except (TypeError, ValueError):
        return None


def _get_multiple_analysis_resilient(symbols: list[str]) -> dict[str, dict[str, Any]]:
    """
    Fetch TradingView batch analysis with per-symbol cache, 429 backoff, and delays.

    Cold KSE-100 ticker loads issue ~5 batch calls; each call sleeps 1.5s afterward.
    """
    if not symbols:
        return {}

    normalized_keys = [_tv_symbol_key(symbol) for symbol in symbols]
    cached, needed = _get_cached_tv_indicators(normalized_keys)
    results: dict[str, dict[str, Any]] = dict(cached)

    if not needed:
        return results

    fresh: dict[str, Any] | None = None
    for attempt in range(2):
        try:
            fresh = get_multiple_analysis(
                screener="pakistan",
                interval=Interval.INTERVAL_1_DAY,
                symbols=needed,
            )
            break
        except Exception as exc:
            logger.warning(
                "TradingView batch fetch failed (attempt %s/2): %s",
                attempt + 1,
                exc,
            )
            if attempt < 1:
                if _is_rate_limit_error(exc):
                    time.sleep(_TV_RATE_LIMIT_BACKOFF[attempt])
                else:
                    time.sleep(0.5)
        finally:
            time.sleep(_TV_POST_CALL_DELAY)

    if fresh:
        for tv_symbol in needed:
            analysis = fresh.get(tv_symbol)
            if analysis is None:
                continue
            indicators = analysis.indicators or {}
            _store_tv_indicators_in_cache(tv_symbol, indicators)
            results[tv_symbol] = indicators

    return results


def _ta_handler_get_analysis_resilient(symbol: str) -> dict[str, Any] | None:
    """Fetch one symbol via TA_Handler with cache, 429 backoff, and post-call delay."""
    if ":" in symbol:
        cleaned = normalize_psx_symbol(symbol.split(":", 1)[1])
    else:
        cleaned = normalize_psx_symbol(symbol)
    if not cleaned:
        return None

    tv_key = f"PSX:{cleaned}"
    cached, _ = _get_cached_tv_indicators([tv_key])
    if tv_key in cached:
        return cached[tv_key]

    for attempt in range(2):
        try:
            handler = TA_Handler(
                symbol=cleaned,
                screener="pakistan",
                exchange="PSX",
                interval=Interval.INTERVAL_1_DAY,
            )
            analysis = handler.get_analysis()
            indicators = analysis.indicators or {}
            if not indicators:
                raise ValueError(f"Empty indicators for {cleaned}")
            _store_tv_indicators_in_cache(tv_key, indicators)
            return indicators
        except Exception as exc:
            logger.warning(
                "TA_Handler failed for %s (attempt %s/2): %s",
                cleaned,
                attempt + 1,
                exc,
            )
            if attempt < 1:
                if _is_rate_limit_error(exc):
                    time.sleep(_TV_RATE_LIMIT_BACKOFF[attempt])
                else:
                    time.sleep(0.5)
        finally:
            time.sleep(_TV_POST_CALL_DELAY)
    return None


def _fetch_symbol_live_price_with_handler(symbol: str) -> float | None:
    """Fetch one symbol close price using the resilient TA_Handler wrapper."""
    cleaned = normalize_psx_symbol(symbol)
    if not cleaned:
        return None
    indicators = _ta_handler_get_analysis_resilient(cleaned)
    if not indicators:
        return None
    close = indicators.get("close")
    if close is None:
        return None
    try:
        return float(close)
    except (TypeError, ValueError):
        return None


def fetch_live_prices_for_symbols(
    symbols: list[str],
    *,
    cache_ttl_seconds: int = _LIVE_PRICE_CACHE_TTL_SECONDS,
) -> dict[str, float | None]:
    """Fetch latest close prices for arbitrary PSX symbols with short TTL cache."""
    normalized = normalize_psx_symbols(symbols)
    if not normalized:
        return {}

    now = time.time()
    prices: dict[str, float | None] = {}
    uncached: list[str] = []

    for symbol in normalized:
        cached_price = _get_close_from_tv_cache(symbol, cache_ttl_seconds)
        if cached_price is not None:
            prices[symbol] = cached_price
            continue
        cached = _LIVE_PRICE_CACHE.get(symbol)
        if cached and now - cached[1] < cache_ttl_seconds:
            prices[symbol] = cached[0]
        else:
            uncached.append(symbol)

    if uncached:
        tv_symbols = [f"PSX:{symbol}" for symbol in uncached]
        results = _get_multiple_analysis_resilient(tv_symbols)

        for symbol in uncached:
            close_price: float | None = None
            try:
                data = results.get(f"PSX:{symbol}")
                if data:
                    close = data.get("close")
                    if close is not None:
                        close_price = float(close)
            except Exception as exc:
                logger.warning("Live price parse error for %s: %s", symbol, exc)

            prices[symbol] = close_price
            if close_price is not None:
                _LIVE_PRICE_CACHE[symbol] = (close_price, now)

    missing_symbols = [symbol for symbol in normalized if prices.get(symbol) is None]
    for symbol in missing_symbols:
        recovered = _fetch_symbol_live_price_with_handler(symbol)
        prices[symbol] = recovered
        if recovered is not None:
            _LIVE_PRICE_CACHE[symbol] = (recovered, now)

    still_missing = [symbol for symbol in normalized if prices.get(symbol) is None]
    for symbol in still_missing:
        psx_price = _fetch_psx_intraday_price(symbol)
        prices[symbol] = psx_price
        if psx_price is not None:
            _LIVE_PRICE_CACHE[symbol] = (psx_price, now)
        else:
            # Keep failures short-lived so transient outages can recover quickly.
            _LIVE_PRICE_CACHE[symbol] = (
                None,
                now - max(0, (cache_ttl_seconds - _LIVE_PRICE_FAILURE_CACHE_TTL_SECONDS)),
            )

    # Preserve original symbol order in returned map.
    ordered: dict[str, float | None] = {}
    for symbol in normalized:
        ordered[symbol] = prices.get(symbol)
    return ordered


KSE100_TOP_15_FALLBACK_SYMBOLS = [
    "OGDC",
    "PPL",
    "LUCK",
    "HUBC",
    "ENGRO",
    "MEBL",
    "SYS",
    "EFERT",
    "FFC",
    "MARI",
    "PSO",
    "DGKC",
    "POL",
    "MCB",
    "BAHL",
]

_MARKET_TICKER_CACHE: tuple[list[dict[str, Any]], float] | None = None
_MARKET_TICKER_CACHE_TTL_SECONDS = 300
_MARKET_TICKER_FETCH_BUDGET_SECONDS = 20.0
_KSE100_SYMBOLS_CACHE: tuple[list[str], float] | None = None
_KSE100_SYMBOLS_CACHE_TTL_SECONDS = 6 * 60 * 60
_KSE100_PSX_QUOTES_CACHE: tuple[dict[str, dict[str, float]], float] | None = None
_KSE100_PSX_QUOTES_TTL_SECONDS = 300


def _fetch_psx_intraday_price(symbol: str) -> float | None:
    """Fetch latest trade price for one symbol from the official PSX DPS API."""
    cleaned = normalize_psx_symbol(symbol)
    if not cleaned:
        return None
    url = PSX_TIMESERIES_INT_URL.format(symbol=cleaned)
    try:
        response = requests.get(url, headers=HTTP_HEADERS, timeout=12)
        response.raise_for_status()
        payload = response.json()
        rows = payload.get("data") if isinstance(payload, dict) else None
        if not rows or not isinstance(rows[0], list) or len(rows[0]) < 2:
            return None
        return float(rows[0][1])
    except Exception as exc:
        logger.warning("PSX intraday price fetch failed for %s: %s", cleaned, exc)
        return None


def _parse_kse100_quotes_from_html(html: str) -> dict[str, dict[str, float]]:
    """Parse KSE-100 constituent quote table from the PSX indices page."""
    quotes: dict[str, dict[str, float]] = {}
    try:
        soup = BeautifulSoup(html, "html.parser")
        table = soup.find("table")
        if not table:
            return quotes
        for row in table.find_all("tr")[1:]:
            cells = [cell.get_text(" ", strip=True) for cell in row.find_all("td")]
            if len(cells) < 5:
                continue
            symbol = normalize_psx_symbol(cells[0])
            if not symbol:
                continue
            try:
                ldcp = float(cells[2].replace(",", ""))
                current = float(cells[3].replace(",", ""))
                change = float(cells[4].replace(",", ""))
            except ValueError:
                continue
            quotes[symbol] = {
                "ldcp": ldcp,
                "current": current,
                "change": change,
            }
    except Exception as exc:
        logger.warning("Failed to parse KSE-100 PSX quotes: %s", exc, exc_info=True)
    return quotes


def _fetch_psx_kse100_quotes() -> dict[str, dict[str, float]]:
    """Fetch all KSE-100 quotes in one PSX page request (TradingView fallback)."""
    global _KSE100_PSX_QUOTES_CACHE

    now = time.time()
    if (
        _KSE100_PSX_QUOTES_CACHE is not None
        and now - _KSE100_PSX_QUOTES_CACHE[1] < _KSE100_PSX_QUOTES_TTL_SECONDS
    ):
        return _KSE100_PSX_QUOTES_CACHE[0]

    html = _fetch_html(PSX_KSE100_CONSTITUENTS_URL)
    quotes = _parse_kse100_quotes_from_html(html) if html else {}
    if quotes:
        _KSE100_PSX_QUOTES_CACHE = (quotes, now)
    return quotes


def fetch_psx_kse100_quote_map() -> dict[str, dict[str, float]]:
    """Public accessor for cached KSE-100 PSX quote map."""
    return _fetch_psx_kse100_quotes()


def _build_ticker_row_from_psx_quote(symbol: str, quote: dict[str, float]) -> dict[str, Any]:
    """Build a ticker row from PSX KSE-100 quote fields."""
    current = quote["current"]
    change = quote.get("change", 0.0)
    ldcp = quote.get("ldcp", current - change)
    high = max(current, ldcp)
    low = min(current, ldcp)
    return {
        "symbol": symbol,
        "current_price": round(current, 2),
        "high": round(high, 2),
        "low": round(low, 2),
        "change": round(change, 2),
        "direction": "UP" if change >= 0 else "DOWN",
    }


def _load_kse100_symbols() -> list[str]:
    """Load KSE-100 constituents from PSX; fallback to a fixed shortlist."""
    global _KSE100_SYMBOLS_CACHE

    now = time.time()
    if (
        _KSE100_SYMBOLS_CACHE is not None
        and now - _KSE100_SYMBOLS_CACHE[1] < _KSE100_SYMBOLS_CACHE_TTL_SECONDS
    ):
        return _KSE100_SYMBOLS_CACHE[0]

    html = _fetch_html(PSX_KSE100_CONSTITUENTS_URL)
    if not html:
        return KSE100_TOP_15_FALLBACK_SYMBOLS

    symbols: list[str] = []
    try:
        soup = BeautifulSoup(html, "html.parser")
        table = soup.find("table")
        if table:
            body_rows = table.find_all("tr")
            for row in body_rows[1:]:
                cells = row.find_all("td")
                if not cells:
                    continue
                raw_symbol = cells[0].get_text(" ", strip=True).upper()
                # Accept values like "PSX: SYS", "SYS:", or "SYS".
                raw_symbol = raw_symbol.replace("PSX:", "").strip().strip(":")
                symbol = normalize_psx_symbol(raw_symbol)
                if symbol and symbol != "PSX":
                    symbols.append(symbol)
    except Exception as exc:
        logger.warning("Failed to parse KSE-100 constituents: %s", exc)
        return KSE100_TOP_15_FALLBACK_SYMBOLS

    deduped = normalize_psx_symbols(symbols)
    if not deduped:
        return KSE100_TOP_15_FALLBACK_SYMBOLS

    _KSE100_SYMBOLS_CACHE = (deduped, now)
    return deduped


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _build_ticker_row(symbol: str, data: dict[str, Any]) -> dict[str, Any]:
    close = _to_float(data.get("close") or data.get("current_price"))
    high = _to_float(data.get("high"))
    low = _to_float(data.get("low"))
    open_price = _to_float(data.get("open"))
    r1 = _to_float(data.get("r1"))
    s1 = _to_float(data.get("s1"))

    if high is None and r1 is not None:
        high = r1
    if low is None and s1 is not None:
        low = s1

    change = _to_float(data.get("change"))
    if change is None and close is not None and open_price is not None:
        change = close - open_price
    if change is None:
        change = 0.0

    return {
        "symbol": symbol,
        "current_price": round(close, 2) if close is not None else 0.0,
        "high": round(high, 2) if high is not None else 0.0,
        "low": round(low, 2) if low is not None else 0.0,
        "change": round(change, 2),
        "direction": "UP" if change >= 0 else "DOWN",
    }


def _parse_ticker_indicators(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "close": data.get("close"),
        "open": data.get("open"),
        "high": data.get("high"),
        "low": data.get("low"),
        "change": data.get("change"),
        "r1": data.get("Pivot.M.Classic.R1"),
        "s1": data.get("Pivot.M.Classic.S1"),
    }


def _chunked(items: list[str], size: int) -> list[list[str]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


def _fetch_symbol_ticker_with_handler(symbol: str) -> dict[str, Any] | None:
    """Fetch one symbol ticker fields using the resilient TA_Handler wrapper."""
    cleaned = normalize_psx_symbol(symbol)
    if not cleaned:
        return None
    indicators = _ta_handler_get_analysis_resilient(cleaned)
    if not indicators:
        return None
    if indicators.get("close") is None:
        logger.warning("TA_Handler ticker fetch missing close for %s", cleaned)
        return None
    return _parse_ticker_indicators(indicators)


def fetch_market_ticker() -> list[dict[str, Any]]:
    """Fetch cached technical ticker data for all KSE-100 constituents."""
    global _MARKET_TICKER_CACHE

    now = time.time()
    if (
        _MARKET_TICKER_CACHE is not None
        and now - _MARKET_TICKER_CACHE[1] < _MARKET_TICKER_CACHE_TTL_SECONDS
    ):
        return _MARKET_TICKER_CACHE[0]
    stale_cache = _MARKET_TICKER_CACHE[0] if _MARKET_TICKER_CACHE is not None else []

    symbol_list = _load_kse100_symbols()
    results: dict[str, Any] = {}
    symbol_chunks = _chunked(symbol_list, 20)
    deadline = time.time() + _MARKET_TICKER_FETCH_BUDGET_SECONDS
    for chunk_index, chunk in enumerate(symbol_chunks):
        if time.time() > deadline:
            logger.warning(
                "Market ticker fetch budget exceeded; returning partial snapshot."
            )
            break
        chunk_tv_symbols = [f"PSX:{symbol}" for symbol in chunk]
        chunk_results = _get_multiple_analysis_resilient(chunk_tv_symbols)
        if chunk_results:
            results.update(chunk_results)

    parsed_by_symbol: dict[str, dict[str, Any]] = {}
    for symbol in symbol_list:
        symbol_key = f"PSX:{symbol}"
        try:
            data = (results or {}).get(symbol_key)
            if data is None:
                raise KeyError(f"No data returned for {symbol_key}")
            parsed_by_symbol[symbol] = _parse_ticker_indicators(data)
        except Exception as exc:
            logger.warning("Market ticker parse error for %s: %s", symbol, exc)

    # Per-symbol recovery is capped to avoid rate-limit storms.
    missing_symbols = [
        symbol
        for symbol in symbol_list
        if symbol not in parsed_by_symbol or parsed_by_symbol[symbol].get("close") is None
    ]
    for symbol in missing_symbols[:5]:
        if time.time() > deadline:
            break
        recovered = _fetch_symbol_ticker_with_handler(symbol)
        if recovered is not None:
            parsed_by_symbol[symbol] = recovered

    rows: list[dict[str, Any]] = []
    for symbol in symbol_list:
        indicator_data = parsed_by_symbol.get(symbol, {})
        rows.append(_build_ticker_row(symbol, indicator_data))

    valid_price_count = sum(1 for row in rows if row["current_price"] > 0)
    if valid_price_count < len(rows):
        psx_quotes = _fetch_psx_kse100_quotes()
        if psx_quotes:
            logger.info(
                "Filling %s missing ticker prices from PSX KSE-100 page.",
                len(rows) - valid_price_count,
            )
            for index, row in enumerate(rows):
                if row["current_price"] > 0:
                    continue
                quote = psx_quotes.get(row["symbol"])
                if quote:
                    rows[index] = _build_ticker_row_from_psx_quote(row["symbol"], quote)
            valid_price_count = sum(1 for row in rows if row["current_price"] > 0)

    if valid_price_count == 0:
        if stale_cache:
            logger.warning(
                "Market ticker fetch returned zero valid prices; serving previous cached snapshot."
            )
            return stale_cache
        logger.warning(
            "Market ticker fetch returned zero valid prices and no prior cache is available."
        )

    _MARKET_TICKER_CACHE = (rows, now)
    return rows


def fetch_kse100_ticker_rows_for_db(
    *,
    tv_recovery_limit: int = 15,
) -> list[dict[str, Any]]:
    """Build ticker rows for all KSE-100 constituents (cron / DB upsert)."""
    psx_quotes = _fetch_psx_kse100_quotes()
    if not psx_quotes:
        time.sleep(3.0)
        psx_quotes = _fetch_psx_kse100_quotes()

    if psx_quotes:
        symbol_list = list(psx_quotes.keys())
    else:
        symbol_list = _load_kse100_symbols()

    rows_by_symbol: dict[str, dict[str, Any]] = {}
    for symbol in symbol_list:
        quote = psx_quotes.get(symbol)
        if quote:
            rows_by_symbol[symbol] = _build_ticker_row_from_psx_quote(symbol, quote)

    missing = [symbol for symbol in symbol_list if symbol not in rows_by_symbol]
    if missing:
        logger.info(
            "PSX KSE-100 page missing %s symbols; trying TradingView for up to %s.",
            len(missing),
            tv_recovery_limit,
        )
        for index, symbol in enumerate(missing[:tv_recovery_limit]):
            if index > 0:
                time.sleep(_TV_POST_CALL_DELAY)
            recovered = _fetch_symbol_ticker_with_handler(symbol)
            if recovered is not None:
                rows_by_symbol[symbol] = _build_ticker_row(symbol, recovered)

    rows = [rows_by_symbol[symbol] for symbol in symbol_list if symbol in rows_by_symbol]
    logger.info(
        "Prepared %s/%s KSE-100 ticker rows for DB upsert.",
        len(rows),
        len(symbol_list),
    )
    return rows


_PSX_SYMBOLS_CACHE: list[dict[str, str]] | None = None
_PSX_SYMBOLS_CACHE_AT: float = 0.0
_PSX_SYMBOLS_CACHE_TTL = 6 * 60 * 60  # 6 hours


def _load_psx_symbols() -> list[dict[str, str]]:
    """Load and cache PSX equity symbols from the official symbols page."""
    global _PSX_SYMBOLS_CACHE, _PSX_SYMBOLS_CACHE_AT

    now = time.time()
    if _PSX_SYMBOLS_CACHE is not None and now - _PSX_SYMBOLS_CACHE_AT < _PSX_SYMBOLS_CACHE_TTL:
        return _PSX_SYMBOLS_CACHE

    html = _fetch_html(PSX_SYMBOLS_URL)
    if not html:
        return _PSX_SYMBOLS_CACHE or []

    try:
        stripped = html.strip()
        if not stripped.startswith(("[", "{")):
            logger.warning(
                "PSX symbols endpoint returned non-JSON payload (len=%s).",
                len(stripped),
            )
            return _PSX_SYMBOLS_CACHE or []

        raw_items = json.loads(stripped)
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse PSX symbols JSON: %s", exc, exc_info=True)
        return _PSX_SYMBOLS_CACHE or []

    symbols: list[dict[str, str]] = []
    for item in raw_items:
        if item.get("isDebt") or item.get("isETF"):
            continue
        symbol = str(item.get("symbol", "")).strip().upper()
        name = str(item.get("name", "")).strip()
        sector = str(item.get("sectorName", "")).strip()
        if not symbol:
            continue
        symbols.append({"symbol": symbol, "name": name, "sector": sector})

    symbols.sort(key=lambda entry: entry["symbol"])
    _PSX_SYMBOLS_CACHE = symbols
    _PSX_SYMBOLS_CACHE_AT = now
    return symbols


def search_psx_symbols(query: str, limit: int = 8) -> list[dict[str, str]]:
    """Return PSX symbols matching a ticker or company name prefix."""
    normalized = query.strip().upper()
    if len(normalized) < 1:
        return []

    all_symbols = _load_psx_symbols()
    if not all_symbols:
        return []

    exact: list[dict[str, str]] = []
    prefix: list[dict[str, str]] = []
    contains: list[dict[str, str]] = []
    query_lower = query.strip().lower()

    for entry in all_symbols:
        symbol = entry["symbol"]
        name = entry["name"]
        if symbol == normalized:
            exact.append(entry)
            continue
        if symbol.startswith(normalized):
            prefix.append(entry)
            continue
        if query_lower and query_lower in name.lower():
            contains.append(entry)

    ranked = exact + prefix + contains
    seen: set[str] = set()
    results: list[dict[str, str]] = []
    for entry in ranked:
        if entry["symbol"] in seen:
            continue
        seen.add(entry["symbol"])
        results.append(entry)
        if len(results) >= limit:
            break
    return results


def _fetch_kse100_from_psx_homepage() -> tuple[float | None, list[float]]:
    """Scrape KSE-100 index value from the PSX homepage."""
    html = _fetch_html("https://dps.psx.com.pk/")
    if not html:
        return None, []
    try:
        text = BeautifulSoup(html, "html.parser").get_text(" ", strip=True)
        match = re.search(r"KSE\s*100[^\d]*([\d,]+\.?\d*)", text, re.IGNORECASE)
        if not match:
            return None, []
        value = float(match.group(1).replace(",", ""))
        sparkline = [value * 0.99, value * 0.995, value * 1.002, value * 0.998, value]
        return value, sparkline
    except Exception as exc:
        logger.warning("Failed to parse KSE-100 from PSX homepage: %s", exc, exc_info=True)
        return None, []


def _fetch_kse100_from_investing() -> tuple[float | None, float | None, float | None, list[float]]:
    """Scrape KSE-100 index value from Investing.com as a secondary fallback."""
    html = _fetch_html(INVESTING_KSE100_URL)
    if not html:
        return None, None, None, []
    try:
        soup = BeautifulSoup(html, "html.parser")
        value: float | None = None
        change: float | None = None
        change_pct: float | None = None

        price_el = soup.select_one('[data-test="instrument-price-last"]')
        if price_el:
            value = float(price_el.get_text(strip=True).replace(",", ""))
        else:
            match = re.search(
                r'data-test="instrument-price-last"[^>]*>([\d,]+\.?\d*)',
                html,
            )
            if match:
                value = float(match.group(1).replace(",", ""))

        change_el = soup.select_one('[data-test="instrument-price-change"]')
        if change_el:
            change_text = change_el.get_text(strip=True).replace(",", "")
            change = float(change_text.replace("+", ""))

        pct_el = soup.select_one('[data-test="instrument-price-change-percent"]')
        if pct_el:
            pct_text = pct_el.get_text(strip=True).replace("%", "").replace(",", "")
            change_pct = float(pct_text.replace("+", "").replace("(", "").replace(")", ""))

        sparkline: list[float] = []
        if value is not None:
            sparkline = [value * 0.99, value * 0.995, value * 1.002, value * 0.998, value]
        return value, change, change_pct, sparkline
    except Exception as exc:
        logger.error("Failed to parse KSE-100 from Investing.com: %s", exc, exc_info=True)
        return None, None, None, []


def _build_kse100_index_response(
    value: float,
    change: float | None,
    change_pct: float | None,
    sparkline: list[float],
) -> dict[str, Any]:
    if change is None and sparkline and len(sparkline) >= 2:
        change = sparkline[-1] - sparkline[0]
    if change_pct is None and sparkline and sparkline[0]:
        change_pct = (change or 0) / sparkline[0] * 100

    return {
        "name": "KSE-100 Index",
        "value": round(value, 2),
        "change": round(change or 0, 2),
        "change_pct": round(change_pct or 0, 2),
        "sparkline": [round(v, 2) for v in sparkline] if sparkline else [round(value, 2)],
    }


def _zeroed_kse100_index() -> dict[str, Any]:
    return {
        "name": "KSE-100 Index",
        "value": 0.0,
        "change": 0.0,
        "change_pct": 0.0,
        "sparkline": [0, 0, 0, 0, 0],
    }


def fetch_kse100_index() -> dict[str, Any]:
    """Fetch KSE-100 index value with TradingView, PSX, and Investing.com fallbacks."""
    global _KSE100_INDEX_CACHE

    now = time.time()
    if (
        _KSE100_INDEX_CACHE is not None
        and now - _KSE100_INDEX_CACHE[1] < _KSE100_INDEX_CACHE_TTL_SECONDS
    ):
        return _KSE100_INDEX_CACHE[0]

    index_symbols = ["PSX:KSE100", "KSE:KSE100", "PSX:KSE100INDEX"]
    value: float | None = None
    change: float | None = None
    change_pct: float | None = None
    sparkline: list[float] = []

    for tv_symbol in index_symbols:
        try:
            results = _get_multiple_analysis_resilient([tv_symbol])
            data = results.get(_tv_symbol_key(tv_symbol))
            if not data:
                continue

            close = data.get("close")
            if close is None:
                continue

            value = float(close)
            change = data.get("change")
            change_pct = data.get("change_percent") or data.get("change")
            if change is not None:
                change = float(change)
            if change_pct is not None:
                change_pct = float(change_pct)

            open_price = data.get("open") or close
            high = data.get("high") or close
            low = data.get("low") or close
            sparkline = [
                float(open_price),
                float(low),
                float((float(high) + float(low)) / 2),
                float(high),
                float(close),
            ]
            break
        except Exception as exc:
            logger.warning("KSE-100 fetch via %s failed: %s", tv_symbol, exc)

    if value is None:
        psx_value, psx_sparkline = _fetch_kse100_from_psx_homepage()
        if psx_value is not None:
            value = psx_value
            sparkline = psx_sparkline

    if value is None:
        investing_value, investing_change, investing_pct, investing_sparkline = (
            _fetch_kse100_from_investing()
        )
        if investing_value is not None:
            value = investing_value
            change = investing_change
            change_pct = investing_pct
            sparkline = investing_sparkline

    if value is None:
        response = _zeroed_kse100_index()
        _KSE100_INDEX_CACHE = (response, now)
        return response

    response = _build_kse100_index_response(value, change, change_pct, sparkline)
    _KSE100_INDEX_CACHE = (response, now)
    return response


def fetch_technical_data(
    portfolio: dict[str, Holding],
) -> tuple[list[dict[str, Any]], str]:
    """
    Fetch TradingView technical data for each portfolio symbol.

    Computes exact PKR P/L as (current - buy_price) * quantity.
    Returns structured rows and a plain-text block for the AI prompt.
    """
    indicators = fetch_market_indicators(set(portfolio.keys()))
    rows: list[dict[str, Any]] = []
    text_lines: list[str] = []

    for symbol, holding in portfolio.items():
        market = indicators.get(symbol, {})
        row, text_line = _build_technical_row(
            symbol,
            holding["buy_price"],
            holding["quantity"],
            market.get("current_price"),
            market.get("rsi"),
            market.get("volume"),
            market.get("r1"),
            market.get("s1"),
            error=market.get("error"),
        )
        rows.append(row)
        text_lines.append(text_line)

    return rows, "\n".join(text_lines)


def build_market_data_cache(symbols: set[str]) -> dict[str, Any]:
    """Fetch technicals, fundamentals, and PSX events once for all symbols."""
    print(f"Building market data cache for {len(symbols)} unique symbol(s)...")
    return {
        "technicals": fetch_market_indicators(symbols),
        "fundamentals": fetch_fundamentals(symbols),
        "psx_events": fetch_psx_corporate_events(symbols),
    }


def build_client_report_data(
    portfolio: dict[str, Holding],
    cache: dict[str, Any],
) -> tuple[list[dict[str, Any]], str, dict[str, Any], dict[str, Any]]:
    """
    Assemble client-specific enriched rows, prompt text, summary, and PSX events.

    Uses cached market data merged with the client's holdings (buy price, qty, sector).
    """
    technicals = cache.get("technicals", {})
    fundamentals = cache.get("fundamentals", {})
    psx_events_cache = cache.get("psx_events", {})

    rows: list[dict[str, Any]] = []
    for symbol, holding in portfolio.items():
        market = technicals.get(symbol, {})
        row, _ = _build_technical_row(
            symbol,
            holding["buy_price"],
            holding["quantity"],
            market.get("current_price"),
            market.get("rsi"),
            market.get("volume"),
            market.get("r1"),
            market.get("s1"),
            error=market.get("error"),
        )
        rows.append(row)

    enriched_rows, technical_text = enrich_portfolio_rows(
        rows, portfolio, fundamentals
    )
    portfolio_summary = compute_portfolio_summary(enriched_rows)

    client_symbols = set(portfolio.keys())
    portfolio_events = build_portfolio_events_map(
        client_symbols,
        psx_events_cache.get("payouts", []),
        psx_events_cache.get("board_meetings", []),
    )
    client_psx_events = {
        "payouts": psx_events_cache.get("payouts", []),
        "board_meetings": psx_events_cache.get("board_meetings", []),
        "payouts_text": psx_events_cache.get(
            "payouts_text", "No payout data available."
        ),
        "board_meetings_text": psx_events_cache.get(
            "board_meetings_text", "No board meeting data available."
        ),
        "portfolio_events": portfolio_events,
        "portfolio_events_text": _format_portfolio_events_text(portfolio_events),
    }

    return enriched_rows, technical_text, portfolio_summary, client_psx_events


PSX_COMPANY_URL = "https://dps.psx.com.pk/company/{symbol}"


def _parse_fundamentals_from_html(html: str) -> dict[str, str]:
    """Extract P/E ratio and EPS from a PSX company page."""
    text = BeautifulSoup(html, "html.parser").get_text(" ", strip=True)
    pe_match = re.search(r"P/E Ratio \(TTM\)\s*\*?\*?\s*([\d.]+)", text)
    eps_match = re.search(
        r"Annual.*?EPS\s+([\d.]+)",
        text,
        flags=re.IGNORECASE,
    )
    return {
        "pe_ratio": pe_match.group(1) if pe_match else "N/A",
        "eps": eps_match.group(1) if eps_match else "N/A",
    }


def fetch_fundamentals(symbols: set[str]) -> dict[str, dict[str, str]]:
    """Fetch P/E ratio and EPS for each symbol from PSX company pages."""
    fundamentals: dict[str, dict[str, str]] = {}
    for index, symbol in enumerate(sorted(symbols)):
        html = _fetch_html(PSX_COMPANY_URL.format(symbol=symbol))
        if html:
            try:
                fundamentals[symbol] = _parse_fundamentals_from_html(html)
            except Exception as exc:
                logger.error(
                    "Failed to parse fundamentals for %s: %s", symbol, exc, exc_info=True
                )
                fundamentals[symbol] = {"pe_ratio": "N/A", "eps": "N/A"}
        else:
            fundamentals[symbol] = {"pe_ratio": "N/A", "eps": "N/A"}
        if index < len(symbols) - 1:
            time.sleep(0.3)
    return fundamentals


def _format_pe_eps(fund: dict[str, str]) -> str:
    pe = fund.get("pe_ratio", "N/A")
    eps = fund.get("eps", "N/A")
    if pe == "N/A" and eps == "N/A":
        return "N/A"
    if eps != "N/A":
        return f"{pe} / EPS {eps}"
    return str(pe)


def _format_holding_period(holding_days: int | None, cgt_status: str) -> str:
    if holding_days is None or cgt_status == "N/A":
        return "N/A"
    return f"{holding_days} days — {cgt_status}"


def enrich_portfolio_rows(
    rows: list[dict[str, Any]],
    portfolio: dict[str, Holding],
    fundamentals: dict[str, dict[str, str]],
) -> tuple[list[dict[str, Any]], str]:
    """Merge sector, CGT, and fundamentals into technical rows."""
    enriched: list[dict[str, Any]] = []
    text_lines: list[str] = []

    for row in rows:
        symbol = row["symbol"]
        holding = portfolio[symbol]
        fund = fundamentals.get(symbol, {"pe_ratio": "N/A", "eps": "N/A"})
        holding_days, cgt_status = _compute_cgt_status(holding["buy_date"])

        updated = dict(row)
        updated["sector"] = holding["sector"]
        updated["holding_days"] = holding_days
        updated["cgt_status"] = cgt_status
        updated["pe_ratio"] = fund.get("pe_ratio", "N/A")
        updated["eps"] = fund.get("eps", "N/A")
        enriched.append(updated)

        pl_text = "N/A"
        if updated.get("pl_amount") is not None and updated.get("pl_pct") is not None:
            pl_text = f"{_format_pkr(updated['pl_amount'])} ({updated['pl_pct']:+.2f}%)"

        text_lines.append(
            f"{symbol} | Sector: {holding['sector']} | Qty: {updated['quantity']:,} | "
            f"Buy: {_format_number(updated['buy_price'])} | "
            f"Current: {_format_number(updated.get('current_price'))} | P/L: {pl_text} | "
            f"P/E & EPS: {_format_pe_eps(fund)} | "
            f"Holding: {_format_holding_period(holding_days, cgt_status)} | "
            f"RSI: {_format_number(updated.get('rsi'))} | "
            f"R1: {_format_number(updated.get('r1'))} | S1: {_format_number(updated.get('s1'))}"
        )

    return enriched, "\n".join(text_lines)


def compute_portfolio_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Compute total portfolio value, P/L, sector allocation, and risk warnings."""
    total_value = 0.0
    total_pl = 0.0
    sector_values: dict[str, float] = {}

    for row in rows:
        current = row.get("current_price")
        quantity = row.get("quantity", 0)
        pl_amount = row.get("pl_amount")
        sector = row.get("sector", "Unknown")

        if current is not None and quantity:
            position_value = current * quantity
            total_value += position_value
            sector_values[sector] = sector_values.get(sector, 0.0) + position_value
        if pl_amount is not None:
            total_pl += pl_amount

    sector_allocation: dict[str, float] = {}
    if total_value > 0:
        sector_allocation = {
            sector: (value / total_value) * 100
            for sector, value in sector_values.items()
        }

    risk_warnings = [
        f"{sector} at {pct:.1f}% (exceeds 40% limit)"
        for sector, pct in sorted(sector_allocation.items(), key=lambda x: -x[1])
        if pct > 40
    ]

    return {
        "total_portfolio_value_pkr": total_value,
        "total_unrealized_pl_pkr": total_pl,
        "sector_allocation": sector_allocation,
        "risk_warnings": risk_warnings,
    }


def format_portfolio_summary_for_prompt(summary: dict[str, Any]) -> str:
    """Format portfolio summary as plain text for the AI prompt."""
    lines = [
        f"Total Portfolio Value (PKR): Rs. {summary['total_portfolio_value_pkr']:,.0f}",
        f"Total Unrealized P/L (PKR): {_format_pkr(summary['total_unrealized_pl_pkr'])}",
        "Sector Allocation:",
    ]
    for sector, pct in sorted(
        summary["sector_allocation"].items(), key=lambda x: -x[1]
    ):
        lines.append(f"  - {sector}: {pct:.1f}%")

    if summary["risk_warnings"]:
        lines.append("RISK WARNINGS (>40% sector concentration):")
        for warning in summary["risk_warnings"]:
            lines.append(f"  - {warning}")
    else:
        lines.append("RISK WARNINGS: None (all sectors within 40% limit).")

    return "\n".join(lines)


def _extract_news_source(entry: Any) -> str:
    """Extract publisher/source name from an RSS entry."""
    source = getattr(entry, "source", None)
    if source is not None:
        title = getattr(source, "title", "") or getattr(source, "value", "")
        if title:
            return str(title).strip()
    title = getattr(entry, "title", "").strip()
    if " - " in title:
        return title.rsplit(" - ", 1)[-1].strip()
    return "News"


def _normalize_news_item(entry: Any) -> dict[str, str] | None:
    title = getattr(entry, "title", "").strip()
    link = getattr(entry, "link", "").strip()
    if not title:
        return None
    source = _extract_news_source(entry)
    clean_title = title.rsplit(" - ", 1)[0].strip() if " - " in title else title
    snippet = clean_title if len(clean_title) <= 140 else f"{clean_title[:137]}..."
    return {
        "title": clean_title,
        "snippet": snippet,
        "source": source,
        "link": link,
        "published": getattr(entry, "published", "").strip(),
    }


def fetch_pakistan_news(limit: int = 3) -> list[dict[str, str]]:
    """Fetch top Pakistan/PSX news headlines from Google News RSS."""
    headlines: list[dict[str, str]] = []
    try:
        feed = feedparser.parse(PAKISTAN_NEWS_URL)
        for entry in feed.entries:
            item = _normalize_news_item(entry)
            if not item:
                continue
            headlines.append(item)
            if len(headlines) >= limit:
                break
    except Exception as exc:
        print(f"News fetch failed: {exc}", file=sys.stderr)
    return headlines


def fetch_global_finance_news(limit: int = 5) -> list[dict[str, str]]:
    """Fetch top global financial news headlines from Google News RSS."""
    headlines: list[dict[str, str]] = []
    try:
        feed = feedparser.parse(GLOBAL_FINANCE_NEWS_URL)
        for entry in feed.entries:
            item = _normalize_news_item(entry)
            if not item:
                continue
            headlines.append(item)
            if len(headlines) >= limit:
                break
    except Exception as exc:
        print(f"Global news fetch failed: {exc}", file=sys.stderr)
    return headlines


def fetch_news_feeds(
    pakistan_limit: int = 5,
    global_limit: int = 5,
) -> dict[str, list[dict[str, str]]]:
    """Fetch Pakistan and global finance news for the API."""
    return {
        "pakistan": fetch_pakistan_news(limit=pakistan_limit),
        "global": fetch_global_finance_news(limit=global_limit),
    }


def parse_psx_date(raw: str) -> date | None:
    """Parse PSX date strings into a date object."""
    if not raw:
        return None

    text = str(raw).strip()
    if not text or text == "-":
        return None

    # Use first part of a range if present.
    if re.search(r"\s[-–—]\s", text):
        text = re.split(r"\s[-–—]\s", text)[0].strip()

    # Drop trailing time suffix.
    text = re.sub(r"\s+\d{1,2}:\d{2}(\s*[APap][Mm])?\s*$", "", text).strip()

    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return date.fromisoformat(text)

    match = re.match(r"^(\d{1,2})[-\s/]([A-Za-z]{3,9})[-\s/](\d{4})$", text)
    if match:
        day, month_name, year = match.groups()
        month = MONTHS.get(month_name.lower())
        if month:
            return date(int(year), month, int(day))

    match = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", text)
    if match:
        day, month, year = match.groups()
        return date(int(year), int(month), int(day))

    match = re.match(r"^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$", text)
    if match:
        month_name, day, year = match.groups()
        month = MONTHS.get(month_name.lower())
        if month:
            return date(int(year), month, int(day))

    return None


def parse_psx_date_range(raw: str) -> list[date]:
    """Parse one or two dates from a PSX date/range string."""
    if not raw:
        return []

    parts = [part.strip() for part in re.split(r"\s[-–—]\s", str(raw)) if part.strip()]
    dates: list[date] = []
    for part in parts:
        parsed = parse_psx_date(part)
        if parsed:
            dates.append(parsed)
    if not dates:
        parsed = parse_psx_date(raw)
        if parsed:
            dates.append(parsed)
    return dates


def is_within_event_window(event_date: date, today: date | None = None) -> bool:
    """Return True if event_date is within +/- 15 days of today (PKT)."""
    today = today or datetime.now(PKT).date()
    start = today - timedelta(days=EVENT_WINDOW_PAST_DAYS)
    end = today + timedelta(days=EVENT_WINDOW_FUTURE_DAYS)
    return start <= event_date <= end


def _payout_in_window(item: dict[str, str], today: date) -> bool:
    dates: list[date] = []
    dates.extend(parse_psx_date_range(item.get("announcement_date", "")))
    dates.extend(parse_psx_date_range(item.get("book_closure", "")))
    return any(is_within_event_window(d, today) for d in dates)


def _board_meeting_in_window(item: dict[str, str], today: date) -> bool:
    parsed = parse_psx_date(item.get("date", ""))
    return parsed is not None and is_within_event_window(parsed, today)


def _filter_payouts_by_date_window(
    payouts: list[dict[str, str]],
) -> list[dict[str, str]]:
    today = datetime.now(PKT).date()
    filtered = [item for item in payouts if _payout_in_window(item, today)]
    dropped = len(payouts) - len(filtered)
    if dropped:
        print(
            f"Filtered out {dropped} payout record(s) outside +/-15 day window.",
            file=sys.stderr,
        )
    return filtered


def _filter_board_meetings_by_date_window(
    board_meetings: list[dict[str, str]],
) -> list[dict[str, str]]:
    today = datetime.now(PKT).date()
    filtered = [item for item in board_meetings if _board_meeting_in_window(item, today)]
    dropped = len(board_meetings) - len(filtered)
    if dropped:
        print(
            f"Filtered out {dropped} board meeting record(s) outside +/-15 day window.",
            file=sys.stderr,
        )
    return filtered


def build_portfolio_events_map(
    portfolio_symbols: set[str],
    payouts: list[dict[str, str]],
    board_meetings: list[dict[str, str]],
) -> dict[str, str]:
    """Map each portfolio symbol to a summary of upcoming dividends/meetings."""
    events: dict[str, list[str]] = {symbol: [] for symbol in sorted(portfolio_symbols)}

    for item in payouts:
        symbol = item.get("symbol", "").upper()
        if symbol not in events:
            continue
        label = item.get("dividend") or item.get("announcement_date") or "Dividend event"
        date_text = item.get("announcement_date") or item.get("book_closure") or ""
        summary = f"Dividend: {label}"
        if date_text:
            summary += f" ({date_text})"
        events[symbol].append(summary)

    for item in board_meetings:
        symbol = item.get("symbol", "").upper()
        if symbol not in events:
            continue
        title = item.get("title") or "Board Meeting"
        date_text = item.get("date") or ""
        summary = title if not date_text else f"{title} ({date_text})"
        events[symbol].append(summary)

    return {
        symbol: "; ".join(summaries) if summaries else "-"
        for symbol, summaries in events.items()
    }


def _format_portfolio_events_text(events_map: dict[str, str]) -> str:
    return "\n".join(
        f"{symbol} | Upcoming Events: {summary}"
        for symbol, summary in events_map.items()
    )


def _fetch_html_with_retry(
    url: str,
    *,
    attempts: int = 2,
    retry_delay: float = 3.0,
) -> str | None:
    """Fetch HTML with browser-like headers, retrying transient failures."""
    for attempt in range(attempts):
        try:
            response = requests.get(url, headers=HTTP_HEADERS, timeout=15)
            response.raise_for_status()
            text = response.text
            if not text or not text.strip():
                raise ValueError(f"Empty response body from {url}")
            return text
        except Exception as exc:
            if attempt < attempts - 1:
                logger.warning(
                    "Failed to fetch %s (attempt %s/%s): %s",
                    url,
                    attempt + 1,
                    attempts,
                    exc,
                )
                time.sleep(retry_delay)
            else:
                logger.warning(
                    "Failed to fetch %s after %s attempts: %s",
                    url,
                    attempts,
                    exc,
                    exc_info=True,
                )
    return None


def _fetch_html(url: str) -> str | None:
    """Fetch a PSX page with browser-like headers."""
    return _fetch_html_with_retry(url)


def _normalize_header(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def _parse_table_rows(html: str) -> list[dict[str, str]]:
    """Parse HTML tables into row dicts keyed by header (largest table first)."""
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")
    if not tables:
        return []

    tables = sorted(
        tables,
        key=lambda table: len(table.find_all("tr")),
        reverse=True,
    )

    parsed_rows: list[dict[str, str]] = []
    for table in tables:
        header_cells = table.find("tr")
        if not header_cells:
            continue
        headers = [
            _normalize_header(cell.get_text(" ", strip=True))
            for cell in header_cells.find_all(["th", "td"])
        ]
        if not headers:
            continue

        header_values = [
            cell.get_text(" ", strip=True)
            for cell in header_cells.find_all(["th", "td"])
        ]

        for tr in table.find_all("tr")[1:]:
            cells = [
                cell.get_text(" ", strip=True) for cell in tr.find_all(["td", "th"])
            ]
            if not cells or all(not cell for cell in cells):
                continue
            if cells == header_values:
                continue

            if len(cells) >= len(headers):
                row = {headers[i]: cells[i] for i in range(len(headers)) if cells[i]}
            else:
                row = {f"col_{i}": value for i, value in enumerate(cells) if value}
            parsed_rows.append(row)

    return parsed_rows


def _parse_company_event_tables(
    html: str, symbol: str
) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    """Parse dividend and board-meeting rows from a PSX company page."""
    soup = BeautifulSoup(html, "html.parser")
    payouts: list[dict[str, str]] = []
    board_meetings: list[dict[str, str]] = []

    for table in soup.find_all("table"):
        header_row = table.find("tr")
        if not header_row:
            continue
        headers = [
            _normalize_header(cell.get_text(" ", strip=True))
            for cell in header_row.find_all(["th", "td"])
        ]
        if "date" not in headers or "title" not in headers:
            continue

        date_idx = headers.index("date")
        title_idx = headers.index("title")

        for tr in table.find_all("tr")[1:]:
            cells = [td.get_text(" ", strip=True) for td in tr.find_all("td")]
            if len(cells) <= max(date_idx, title_idx):
                continue

            event_date = cells[date_idx]
            title = cells[title_idx]
            if not event_date or not title or event_date.lower() == "date":
                continue

            title_lower = title.lower()
            if "board meeting" in title_lower or "bod" in title_lower:
                board_meetings.append(
                    {
                        "symbol": symbol,
                        "title": title,
                        "date": event_date,
                        "category": "Board Meeting",
                    }
                )
            elif any(
                keyword in title_lower
                for keyword in (
                    "dividend",
                    "payout",
                    "book closure",
                    "interim",
                    "bonus",
                    "right",
                )
            ):
                payouts.append(
                    {
                        "symbol": symbol,
                        "dividend": title,
                        "announcement_date": event_date,
                        "book_closure": "N/A",
                        "company": "",
                    }
                )

    return payouts, board_meetings


def _scrape_company_events(symbol: str) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    """Fetch dividend and board-meeting rows for a single portfolio symbol."""
    html = _fetch_html(f"https://dps.psx.com.pk/company/{symbol}")
    if not html:
        return [], []
    try:
        return _parse_company_event_tables(html, symbol.upper())
    except Exception as exc:
        logger.error("Failed to parse company page for %s: %s", symbol, exc, exc_info=True)
        return [], []


def _pick_column(row: dict[str, str], *candidates: str) -> str:
    """Return the first matching column value from a normalized row dict."""
    for key, value in row.items():
        for candidate in candidates:
            if candidate in key:
                return value
    return ""


def scrape_psx_payouts(limit: int = 15) -> list[dict[str, str]]:
    """Scrape dividend/payout rows from the PSX payouts page."""
    html = _fetch_html(PSX_PAYOUTS_URL)
    if not html:
        return []

    try:
        parsed_rows = _parse_table_rows(html)
        payouts: list[dict[str, str]] = []

        for row in parsed_rows:
            symbol = _pick_column(row, "symbol")
            if not symbol:
                continue

            payouts.append(
                {
                    "symbol": symbol.upper(),
                    "company": _pick_column(row, "company"),
                    "dividend": _pick_column(
                        row, "dividend announcement", "dividend", "payout"
                    ),
                    "announcement_date": _pick_column(
                        row, "date / time of announcement", "announcement"
                    ),
                    "book_closure": _pick_column(
                        row, "book closure date", "book closure"
                    ),
                }
            )

        return payouts[:limit]
    except Exception as exc:
        logger.error("Failed to parse PSX payouts: %s", exc, exc_info=True)
        return []


def scrape_psx_board_meetings(limit: int = 10) -> list[dict[str, str]]:
    """Scrape board meeting and dividend announcements from PSX."""
    html = _fetch_html(PSX_ANNOUNCEMENTS_URL)
    if not html:
        return []

    try:
        parsed_rows = _parse_table_rows(html)
        announcements: list[dict[str, str]] = []

        for row in parsed_rows:
            symbol = _pick_column(row, "symbol", "company symbol")
            title = _pick_column(
                row, "subject", "announcement", "title", "description"
            )
            event_date = _pick_column(row, "date", "posted", "announcement date")
            category = _pick_column(row, "type", "category")

            combined = " ".join([symbol, title, category, event_date]).lower()
            if not any(keyword in combined for keyword in BOARD_MEETING_KEYWORDS):
                continue

            announcements.append(
                {
                    "symbol": symbol.upper() if symbol else "N/A",
                    "title": title or category or "Announcement",
                    "date": event_date,
                    "category": category,
                }
            )

        return announcements[:limit]
    except Exception as exc:
        logger.error("Failed to parse PSX announcements: %s", exc, exc_info=True)
        return []


def _is_on_or_after_today(event_date: date, today: date | None = None) -> bool:
    today = today or datetime.now(PKT).date()
    return event_date >= today


def _to_iso_date(raw: str) -> str | None:
    parsed = parse_psx_date(raw)
    if parsed:
        return parsed.isoformat()
    dates = parse_psx_date_range(raw)
    if dates:
        return dates[0].isoformat()
    return None


def _future_book_closure_date(book_closure_raw: str, today: date) -> date | None:
    dates = parse_psx_date_range(book_closure_raw)
    future_dates = [event_date for event_date in dates if _is_on_or_after_today(event_date, today)]
    if not future_dates:
        return None
    return min(future_dates)


_DIVIDEND_CALENDAR_CACHE: tuple[list[dict[str, str]], float] | None = None
_DIVIDEND_CALENDAR_CACHE_TTL_SECONDS = 600


def fetch_dividend_calendar() -> list[dict[str, str]]:
    """Return upcoming dividend and board-meeting events from today onwards."""
    global _DIVIDEND_CALENDAR_CACHE

    now = time.time()
    if (
        _DIVIDEND_CALENDAR_CACHE is not None
        and now - _DIVIDEND_CALENDAR_CACHE[1] < _DIVIDEND_CALENDAR_CACHE_TTL_SECONDS
    ):
        return _DIVIDEND_CALENDAR_CACHE[0]

    today = datetime.now(PKT).date()
    payouts = scrape_psx_payouts(limit=50)
    board_meetings = scrape_psx_board_meetings(limit=50)

    events: list[dict[str, str]] = []
    seen: set[tuple[str, str, str, str]] = set()

    for item in payouts:
        symbol = str(item.get("symbol", "")).strip().upper()
        if not symbol or symbol == "N/A":
            continue

        closure_date = _future_book_closure_date(item.get("book_closure", ""), today)
        if closure_date is None:
            continue

        details = str(item.get("dividend", "")).strip() or "Dividend announcement"
        event = {
            "symbol": symbol,
            "event_type": "Dividend",
            "details": details,
            "date": closure_date.isoformat(),
        }
        key = (event["symbol"], event["event_type"], event["date"], event["details"])
        if key not in seen:
            seen.add(key)
            events.append(event)

    for item in board_meetings:
        symbol = str(item.get("symbol", "")).strip().upper()
        if not symbol or symbol == "N/A":
            continue

        meeting_date = parse_psx_date(item.get("date", ""))
        if meeting_date is None or not _is_on_or_after_today(meeting_date, today):
            continue

        details = str(item.get("title", "")).strip() or "Board Meeting"
        event = {
            "symbol": symbol,
            "event_type": "Board Meeting",
            "details": details,
            "date": meeting_date.isoformat(),
        }
        key = (event["symbol"], event["event_type"], event["date"], event["details"])
        if key not in seen:
            seen.add(key)
            events.append(event)

    events.sort(key=lambda row: (row["date"], row["symbol"], row["event_type"]))
    _DIVIDEND_CALENDAR_CACHE = (events, now)
    return events


def _prioritize_by_portfolio(
    items: list[dict[str, str]],
    portfolio_symbols: set[str],
    limit: int,
) -> list[dict[str, str]]:
    """Return portfolio-matching items first, then fill with other recent items."""
    portfolio_items = [
        item for item in items if item.get("symbol", "").upper() in portfolio_symbols
    ]
    other_items = [
        item for item in items if item.get("symbol", "").upper() not in portfolio_symbols
    ]
    combined = portfolio_items + other_items
    return combined[:limit]


def fetch_psx_corporate_events(
    portfolio_symbols: set[str],
) -> dict[str, Any]:
    """
    Fetch PSX payouts and board meetings, prioritized for portfolio symbols.

    Returns structured lists plus plain-text blocks for the AI prompt.
    """
    payouts = scrape_psx_payouts(limit=30)
    board_meetings = scrape_psx_board_meetings(limit=20)

    for symbol in sorted(portfolio_symbols):
        company_payouts, company_meetings = _scrape_company_events(symbol)
        payouts.extend(company_payouts)
        board_meetings.extend(company_meetings)

    payouts = _filter_payouts_by_date_window(payouts)
    board_meetings = _filter_board_meetings_by_date_window(board_meetings)

    payouts = _prioritize_by_portfolio(payouts, portfolio_symbols, limit=15)
    board_meetings = _prioritize_by_portfolio(
        board_meetings, portfolio_symbols, limit=10
    )

    portfolio_events = build_portfolio_events_map(
        portfolio_symbols, payouts, board_meetings
    )

    payout_lines = []
    for item in payouts[:5]:
        payout_lines.append(
            f"{item['symbol']} | {item.get('dividend', 'N/A')} | "
            f"Book Closure: {item.get('book_closure', 'N/A')} | "
            f"Announced: {item.get('announcement_date', 'N/A')}"
        )

    meeting_lines = []
    for item in board_meetings[:5]:
        meeting_lines.append(
            f"{item['symbol']} | {item.get('title', 'N/A')} | "
            f"Date: {item.get('date', 'N/A')}"
        )

    return {
        "payouts": payouts,
        "board_meetings": board_meetings,
        "portfolio_events": portfolio_events,
        "portfolio_events_text": _format_portfolio_events_text(portfolio_events),
        "payouts_text": "\n".join(payout_lines) if payout_lines else "No payout data available.",
        "board_meetings_text": (
            "\n".join(meeting_lines) if meeting_lines else "No board meeting data available."
        ),
    }


def format_news_for_prompt(news: list[dict[str, str]]) -> str:
    """Format news headlines as numbered text for the AI prompt."""
    if not news:
        return "No headlines available."
    lines = []
    for index, item in enumerate(news, start=1):
        line = f"{index}. {item['title']}"
        if item.get("link"):
            line += f" ({item['link']})"
        lines.append(line)
    return "\n".join(lines)
