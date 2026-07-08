"""
Data fetchers for PSX portfolio technicals, news, and corporate events.
"""

import re
import sys
import time
from datetime import date, datetime, timedelta
from typing import Any, TypedDict
from zoneinfo import ZoneInfo

import feedparser
import requests
from bs4 import BeautifulSoup
from tradingview_ta import Interval, get_multiple_analysis

PAKISTAN_NEWS_URL = (
    "https://news.google.com/rss/search?"
    "q=Pakistan+Stock+Exchange+OR+State+Bank+Pakistan+Economy"
    "&hl=en-US&gl=US&ceid=US:en"
)
PSX_PAYOUTS_URL = "https://dps.psx.com.pk/payouts"
PSX_ANNOUNCEMENTS_URL = "https://dps.psx.com.pk/announcements/companies"

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


def parse_portfolio(raw: str) -> dict[str, Holding]:
    """
    Parse PORTFOLIO env string into {symbol: {buy_price, quantity}}.

    Format: SYMBOL:BUY_PRICE:QUANTITY (e.g. HUBC:230.00:1000)
    Legacy SYMBOL:BUY_PRICE entries default quantity to 1.
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

        if quantity <= 0:
            print(f"Skipping {symbol}: quantity must be positive.", file=sys.stderr)
            continue

        portfolio[symbol] = {"buy_price": buy_price, "quantity": quantity}
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


def fetch_technical_data(
    portfolio: dict[str, Holding],
) -> tuple[list[dict[str, Any]], str]:
    """
    Fetch TradingView technical data for each portfolio symbol.

    Computes exact PKR P/L as (current - buy_price) * quantity.
    Returns structured rows and a plain-text block for the AI prompt.
    """
    symbols = list(portfolio.keys())
    tv_symbols = [f"PSX:{ticker}" for ticker in symbols]
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

    rows: list[dict[str, Any]] = []
    text_lines: list[str] = []

    if not results:
        for symbol, holding in portfolio.items():
            row, text_line = _build_technical_row(
                symbol,
                holding["buy_price"],
                holding["quantity"],
                None,
                None,
                None,
                None,
                None,
                error="Batch fetch failed",
            )
            rows.append(row)
            text_lines.append(text_line)
        return rows, "\n".join(text_lines)

    for symbol, holding in portfolio.items():
        buy_price = holding["buy_price"]
        quantity = holding["quantity"]
        symbol_key = f"PSX:{symbol}"
        try:
            analysis = results.get(symbol_key)
            if analysis is None:
                raise KeyError(f"No data returned for {symbol_key}")

            indicators = analysis.indicators or {}
            row, text_line = _build_technical_row(
                symbol,
                buy_price,
                quantity,
                indicators.get("close"),
                indicators.get("RSI"),
                indicators.get("volume"),
                indicators.get("Pivot.M.Classic.R1"),
                indicators.get("Pivot.M.Classic.S1"),
            )
            rows.append(row)
            text_lines.append(text_line)
        except Exception as exc:
            print(f"Error processing {symbol}: {exc}", file=sys.stderr)
            row, text_line = _build_technical_row(
                symbol,
                buy_price,
                quantity,
                None,
                None,
                None,
                None,
                None,
                error=str(exc),
            )
            rows.append(row)
            text_lines.append(text_line)

    return rows, "\n".join(text_lines)


def fetch_pakistan_news(limit: int = 3) -> list[dict[str, str]]:
    """Fetch top Pakistan/PSX news headlines from Google News RSS."""
    headlines: list[dict[str, str]] = []
    try:
        feed = feedparser.parse(PAKISTAN_NEWS_URL)
        for entry in feed.entries:
            title = getattr(entry, "title", "").strip()
            link = getattr(entry, "link", "").strip()
            published = getattr(entry, "published", "").strip()
            if not title:
                continue
            headlines.append(
                {"title": title, "link": link, "published": published}
            )
            if len(headlines) >= limit:
                break
    except Exception as exc:
        print(f"News fetch failed: {exc}", file=sys.stderr)
    return headlines


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
