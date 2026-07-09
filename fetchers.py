"""
Data fetchers for PSX portfolio technicals, news, and corporate events.
"""

import json
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

HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

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

    symbol_list = sorted(symbols)
    tv_symbols = [f"PSX:{ticker}" for ticker in symbol_list]
    results: dict[str, Any] | None = None

    for attempt in range(2):
        try:
            results = get_multiple_analysis(
                screener="pakistan",
                interval=Interval.INTERVAL_1_DAY,
                symbols=tv_symbols,
            )
            break
        except Exception as exc:
            print(f"Stock fetch attempt {attempt + 1} failed: {exc}", file=sys.stderr)
            if attempt == 0:
                time.sleep(0.5)

    indicators: dict[str, dict[str, Any]] = {}

    if not results:
        for symbol in symbol_list:
            indicators[symbol] = {
                "current_price": None,
                "rsi": None,
                "volume": None,
                "r1": None,
                "s1": None,
                "error": "Batch fetch failed",
            }
        return indicators

    for symbol in symbol_list:
        symbol_key = f"PSX:{symbol}"
        try:
            analysis = results.get(symbol_key)
            if analysis is None:
                raise KeyError(f"No data returned for {symbol_key}")

            data = analysis.indicators or {}
            indicators[symbol] = {
                "current_price": data.get("close"),
                "rsi": data.get("RSI"),
                "volume": data.get("volume"),
                "r1": data.get("Pivot.M.Classic.R1"),
                "s1": data.get("Pivot.M.Classic.S1"),
                "error": None,
            }
        except Exception as exc:
            print(f"Error processing {symbol}: {exc}", file=sys.stderr)
            indicators[symbol] = {
                "current_price": None,
                "rsi": None,
                "volume": None,
                "r1": None,
                "s1": None,
                "error": str(exc),
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


def _fetch_symbol_live_price_with_handler(symbol: str) -> float | None:
    """Fetch one symbol using TA_Handler with symbol-level retry."""
    for attempt in range(2):
        try:
            handler = TA_Handler(
                symbol=symbol,
                screener="pakistan",
                exchange="PSX",
                interval=Interval.INTERVAL_1_DAY,
            )
            analysis = handler.get_analysis()
            close = (analysis.indicators or {}).get("close")
            if close is None:
                raise ValueError(f"Missing close price in TA_Handler response for {symbol}")
            return float(close)
        except Exception as exc:
            print(
                f"TA_Handler get_analysis failed for {symbol} (attempt {attempt + 1}/2): {exc}",
                file=sys.stderr,
            )
            if attempt == 0:
                time.sleep(0.35)
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
        cached = _LIVE_PRICE_CACHE.get(symbol)
        if cached and now - cached[1] < cache_ttl_seconds:
            prices[symbol] = cached[0]
        else:
            uncached.append(symbol)

    if uncached:
        tv_symbols = [f"PSX:{symbol}" for symbol in uncached]
        results: dict[str, Any] | None = None
        for attempt in range(2):
            try:
                results = get_multiple_analysis(
                    screener="pakistan",
                    interval=Interval.INTERVAL_1_DAY,
                    symbols=tv_symbols,
                )
                break
            except Exception as exc:
                print(
                    f"Live price fetch attempt {attempt + 1} failed: {exc}",
                    file=sys.stderr,
                )
                if attempt == 0:
                    time.sleep(0.4)

        for symbol in uncached:
            close_price: float | None = None
            try:
                analysis = (results or {}).get(f"PSX:{symbol}")
                if analysis and analysis.indicators:
                    close = analysis.indicators.get("close")
                    if close is not None:
                        close_price = float(close)
            except Exception as exc:
                print(f"Live price parse error for {symbol}: {exc}", file=sys.stderr)

            prices[symbol] = close_price
            if close_price is not None:
                _LIVE_PRICE_CACHE[symbol] = (close_price, now)

    missing_symbols = [symbol for symbol in normalized if prices.get(symbol) is None]
    for symbol in missing_symbols:
        recovered = _fetch_symbol_live_price_with_handler(symbol)
        prices[symbol] = recovered
        if recovered is not None:
            _LIVE_PRICE_CACHE[symbol] = (recovered, now)
        else:
            # Keep failures short-lived so transient TradingView outages can recover quickly.
            _LIVE_PRICE_CACHE[symbol] = (
                None,
                now - max(0, (cache_ttl_seconds - _LIVE_PRICE_FAILURE_CACHE_TTL_SECONDS)),
            )

    # Preserve original symbol order in returned map.
    ordered: dict[str, float | None] = {}
    for symbol in normalized:
        ordered[symbol] = prices.get(symbol)
    return ordered


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
        raw_items = json.loads(html.strip())
    except json.JSONDecodeError as exc:
        print(f"Failed to parse PSX symbols JSON: {exc}", file=sys.stderr)
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


def fetch_kse100_index() -> dict[str, Any]:
    """Fetch KSE-100 index value and sparkline data from TradingView."""
    index_symbols = ["PSX:KSE100", "KSE:KSE100", "PSX:KSE100INDEX"]
    value: float | None = None
    change: float | None = None
    change_pct: float | None = None
    sparkline: list[float] = []

    for tv_symbol in index_symbols:
        try:
            results = get_multiple_analysis(
                screener="pakistan",
                interval=Interval.INTERVAL_1_DAY,
                symbols=[tv_symbol],
            )
            analysis = results.get(tv_symbol) if results else None
            if analysis is None:
                continue

            data = analysis.indicators or {}
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
            print(f"KSE-100 fetch via {tv_symbol} failed: {exc}", file=sys.stderr)

    if value is None:
        html = _fetch_html("https://dps.psx.com.pk/")
        if html:
            text = BeautifulSoup(html, "html.parser").get_text(" ", strip=True)
            match = re.search(r"KSE\s*100[^\d]*([\d,]+\.?\d*)", text, re.IGNORECASE)
            if match:
                value = float(match.group(1).replace(",", ""))
                sparkline = [value * 0.99, value * 0.995, value * 1.002, value * 0.998, value]

    if value is None:
        return {
            "name": "KSE-100 Index",
            "value": 0.0,
            "change": 0.0,
            "change_pct": 0.0,
            "sparkline": [0, 0, 0, 0, 0],
        }

    if change is None and sparkline and len(sparkline) >= 2:
        change = sparkline[-1] - sparkline[0]
    if change_pct is None and sparkline and sparkline[0]:
        change_pct = (change or 0) / sparkline[0] * 100

    return {
        "name": "KSE-100 Index",
        "value": round(value, 2),
        "change": round(change or 0, 2),
        "change_pct": round(change_pct or 0, 2),
        "sparkline": [round(v, 2) for v in sparkline] if sparkline else [value],
    }


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
                print(f"Failed to parse fundamentals for {symbol}: {exc}", file=sys.stderr)
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


def _fetch_html(url: str) -> str | None:
    """Fetch a PSX page with browser-like headers."""
    try:
        response = requests.get(url, headers=HTTP_HEADERS, timeout=15)
        response.raise_for_status()
        return response.text
    except Exception as exc:
        print(f"Failed to fetch {url}: {exc}", file=sys.stderr)
        return None


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
        print(f"Failed to parse company page for {symbol}: {exc}", file=sys.stderr)
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
        print(f"Failed to parse PSX payouts: {exc}", file=sys.stderr)
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
        print(f"Failed to parse PSX announcements: {exc}", file=sys.stderr)
        return []


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
