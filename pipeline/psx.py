"""Client for the official PSX Data Portal (dps.psx.com.pk).

Every endpoint used here is one the portal's own front end calls, so the data
is first-party and free. The whole market snapshot arrives in a single request,
which is why this module replaces the previous per-symbol TradingView calls
that were being rate limited with HTTP 429.

Endpoints in use
----------------
GET  /market-watch                 496 symbols: OHLC, volume, sector code,
                                   and index membership (incl. KMIALLSHR)
GET  /performers                   top gainers / losers / most active
GET  /symbols                      JSON: symbol, name, sector name, flags
GET  /timeseries/int/{sym}         intraday ticks (also works for KSE100)
GET  /timeseries/eod/{sym}         end-of-day history (also works for KSE100)
POST /calendar   {from,to}         AGM / EOGM / board meeting calendar (JSON)
POST /payouts    {year}            dividend announcements + book closure dates
GET  /sector-summary/sectorwise    advance / decline / turnover by sector

Notes
-----
* The portal sits behind DOSarrest. A POST without the expected body returns
  HTTP 469, so required parameters are always sent and requests are paced.
* Responses are cached in-process; the pipeline is short lived so the cache
  mainly prevents duplicate calls inside a single job.
"""

from __future__ import annotations

import json
import logging
import re
import time
from datetime import date, datetime, timedelta
from typing import Any, Iterable

import requests
from bs4 import BeautifulSoup

from pipeline.config import PKT

logger = logging.getLogger("smartsarmaya.psx")

BASE = "https://dps.psx.com.pk"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": f"{BASE}/",
}
AJAX_HEADERS = {**HEADERS, "X-Requested-With": "XMLHttpRequest"}

TIMEOUT = 40
RETRIES = 3
RETRY_BACKOFF = (2, 5, 12)
POLITE_DELAY = 0.6  # seconds between calls, to stay well under DOSarrest limits

KMI_INDEX = "KMIALLSHR"
KMI30_INDEX = "KMI30"
KSE100_INDEX = "KSE100"

_cache: dict[str, tuple[Any, float]] = {}
_last_call_at = 0.0


class PsxUnavailableError(RuntimeError):
    """Raised when the PSX portal cannot be reached after retries."""


# --------------------------------------------------------------------------
# transport
# --------------------------------------------------------------------------
def _pace() -> None:
    global _last_call_at
    elapsed = time.time() - _last_call_at
    if elapsed < POLITE_DELAY:
        time.sleep(POLITE_DELAY - elapsed)
    _last_call_at = time.time()


def _request(
    method: str,
    path: str,
    *,
    data: dict[str, Any] | None = None,
    retries: int = RETRIES,
    timeout: int = TIMEOUT,
) -> requests.Response:
    """Perform one portal request.

    Bulk callers pass a lower `retries` and `timeout`. A single slow symbol in a
    300-symbol loop must not be allowed to consume minutes of a scheduled run,
    so the aggressive retry policy is reserved for the handful of calls whose
    failure would empty a whole section of the site.
    """
    url = f"{BASE}{path}"
    headers = AJAX_HEADERS if method == "POST" or data is not None else HEADERS
    last_error: Exception | None = None

    for attempt in range(retries):
        _pace()
        try:
            response = requests.request(
                method, url, data=data, headers=headers, timeout=timeout
            )
            # 469 is DOSarrest's block code; retrying immediately makes it worse.
            if response.status_code == 469:
                raise PsxUnavailableError(f"PSX blocked the request to {path} (469).")
            if response.status_code >= 500:
                raise PsxUnavailableError(
                    f"PSX returned {response.status_code} for {path}."
                )
            response.raise_for_status()
            return response
        except Exception as exc:  # noqa: BLE001 - retried below
            last_error = exc
            if attempt < retries - 1:
                delay = RETRY_BACKOFF[min(attempt, len(RETRY_BACKOFF) - 1)]
                logger.warning(
                    "PSX %s %s failed (%s); retrying in %ss.", method, path, exc, delay
                )
                time.sleep(delay)

    raise PsxUnavailableError(f"PSX {method} {path} failed: {last_error}") from last_error


def _cached(key: str, ttl: int, producer):
    hit = _cache.get(key)
    now = time.time()
    if hit and now - hit[1] < ttl:
        return hit[0]
    value = producer()
    _cache[key] = (value, now)
    return value


# --------------------------------------------------------------------------
# parsing helpers
# --------------------------------------------------------------------------
def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip().replace(",", "").replace("%", "")
    if not text or text in {"-", "--", "N/A"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _to_int(value: Any) -> int:
    parsed = _to_float(value)
    return int(parsed) if parsed is not None else 0


def _table_rows(html: str, table_index: int = 0) -> list[list[str]]:
    """Return the data rows of a table as lists of cell text."""
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")
    if len(tables) <= table_index:
        return []
    rows: list[list[str]] = []
    for tr in tables[table_index].find_all("tr"):
        cells = [td.get_text(" ", strip=True) for td in tr.find_all("td")]
        if cells:
            rows.append(cells)
    return rows


def normalize_symbol(value: Any) -> str:
    """Uppercase a PSX ticker and drop the exchange prefix if present."""
    text = str(value or "").strip().upper()
    if ":" in text:
        text = text.split(":")[-1]
    return re.sub(r"[^A-Z0-9]", "", text)


# --------------------------------------------------------------------------
# market snapshot
# --------------------------------------------------------------------------
def fetch_market_watch() -> list[dict[str, Any]]:
    """Full market snapshot: every listed symbol in one request.

    Columns: SYMBOL, SECTOR, LISTED IN, LDCP, OPEN, HIGH, LOW, CURRENT,
    CHANGE, CHANGE (%), VOLUME.
    """

    def _load() -> list[dict[str, Any]]:
        html = _request("GET", "/market-watch").text
        rows = _table_rows(html)
        out: list[dict[str, Any]] = []
        for cells in rows:
            if len(cells) < 11:
                continue
            symbol = normalize_symbol(cells[0])
            if not symbol:
                continue
            indices = [part.strip().upper() for part in cells[2].split(",") if part.strip()]
            current = _to_float(cells[7])
            if current is None or current <= 0:
                continue
            out.append(
                {
                    "symbol": symbol,
                    "sector_code": cells[1].strip(),
                    "indices": indices,
                    "is_kmi": KMI_INDEX in indices,
                    "is_kmi30": KMI30_INDEX in indices,
                    "is_kse100": KSE100_INDEX in indices,
                    "ldcp": _to_float(cells[3]),
                    "open": _to_float(cells[4]),
                    "high": _to_float(cells[5]),
                    "low": _to_float(cells[6]),
                    "current": current,
                    "change": _to_float(cells[8]) or 0.0,
                    "change_pct": _to_float(cells[9]) or 0.0,
                    "volume": _to_int(cells[10]),
                }
            )
        logger.info("Market watch snapshot: %s symbols.", len(out))
        return out

    return _cached("market_watch", 120, _load)


def fetch_performers() -> dict[str, list[dict[str, Any]]]:
    """Most active, top gainers and top losers.

    The page renders three tables: volume leaders, gainers, losers.
    """

    def _parse(cells: list[str]) -> dict[str, Any] | None:
        if len(cells) < 4:
            return None
        symbol = normalize_symbol(cells[0])
        if not symbol:
            return None
        change_text = cells[2]
        pct_match = re.search(r"\(([-+]?[\d.]+)%\)", change_text)
        return {
            "symbol": symbol,
            "price": _to_float(cells[1]) or 0.0,
            "change": _to_float(change_text.split("(")[0]) or 0.0,
            "change_pct": float(pct_match.group(1)) if pct_match else 0.0,
            "volume": _to_int(cells[3]),
        }

    def _load() -> dict[str, list[dict[str, Any]]]:
        html = _request("GET", "/performers").text
        soup = BeautifulSoup(html, "html.parser")
        tables = soup.find_all("table")
        buckets: list[list[dict[str, Any]]] = []
        for table in tables[:3]:
            items = []
            for tr in table.find_all("tr"):
                cells = [td.get_text(" ", strip=True) for td in tr.find_all("td")]
                if not cells:
                    continue
                parsed = _parse(cells)
                if parsed:
                    items.append(parsed)
            buckets.append(items)
        while len(buckets) < 3:
            buckets.append([])
        return {"most_active": buckets[0], "gainers": buckets[1], "losers": buckets[2]}

    return _cached("performers", 120, _load)


def fetch_symbol_directory() -> list[dict[str, Any]]:
    """Every listed symbol with its official name and sector name."""

    def _load() -> list[dict[str, Any]]:
        payload = _request("GET", "/symbols").json()
        out = []
        for item in payload:
            symbol = normalize_symbol(item.get("symbol"))
            if not symbol:
                continue
            out.append(
                {
                    "symbol": symbol,
                    "name": str(item.get("name") or "").strip(),
                    "sector_name": str(item.get("sectorName") or "").strip(),
                    "is_etf": bool(item.get("isETF")),
                    "is_debt": bool(item.get("isDebt")),
                }
            )
        logger.info("Symbol directory: %s entries.", len(out))
        return out

    return _cached("symbols", 3600, _load)


def fetch_sector_summary() -> list[dict[str, Any]]:
    """Advance / decline / turnover / market cap per sector."""

    def _load() -> list[dict[str, Any]]:
        html = _request("GET", "/sector-summary/sectorwise").text
        out = []
        for cells in _table_rows(html):
            if len(cells) < 7:
                continue
            code = cells[0].strip()
            if not code.isdigit():
                continue
            out.append(
                {
                    "sector_code": code,
                    "sector_name": cells[1].strip(),
                    "advance": _to_int(cells[2]),
                    "decline": _to_int(cells[3]),
                    "unchanged": _to_int(cells[4]),
                    "turnover": _to_int(cells[5]),
                    "market_cap_bn": _to_float(cells[6]) or 0.0,
                }
            )
        return out

    return _cached("sector_summary", 600, _load)


# --------------------------------------------------------------------------
# time series
# --------------------------------------------------------------------------
def fetch_intraday(symbol: str) -> list[tuple[datetime, float, int]]:
    """Intraday ticks, oldest first. Works for symbols and for KSE100."""
    path = f"/timeseries/int/{normalize_symbol(symbol)}"
    payload = _request("GET", path).json()
    rows = payload.get("data") or []
    series: list[tuple[datetime, float, int]] = []
    for row in rows:
        if len(row) < 2:
            continue
        stamp = datetime.fromtimestamp(int(row[0]), tz=PKT)
        price = _to_float(row[1])
        volume = _to_int(row[2]) if len(row) > 2 else 0
        if price is None:
            continue
        series.append((stamp, price, volume))
    series.sort(key=lambda item: item[0])
    return series


BULK_RETRIES = 1
BULK_TIMEOUT = 20


def fetch_eod(symbol: str, *, bulk: bool = False) -> list[tuple[date, float, int]]:
    """End-of-day closes, oldest first. Works for symbols and for KSE100.

    Set `bulk` when iterating many symbols: one attempt with a short timeout, so
    a single unresponsive symbol costs seconds rather than minutes.
    """
    path = f"/timeseries/eod/{normalize_symbol(symbol)}"
    if bulk:
        payload = _request("GET", path, retries=BULK_RETRIES, timeout=BULK_TIMEOUT).json()
    else:
        payload = _request("GET", path).json()
    rows = payload.get("data") or []
    series: list[tuple[date, float, int]] = []
    for row in rows:
        if len(row) < 2:
            continue
        day = datetime.fromtimestamp(int(row[0]), tz=PKT).date()
        close = _to_float(row[1])
        volume = _to_int(row[2]) if len(row) > 2 else 0
        if close is None:
            continue
        series.append((day, close, volume))
    series.sort(key=lambda item: item[0])
    return series


def fetch_index_snapshot(index: str = KSE100_INDEX) -> dict[str, Any]:
    """Current index level, change, and an intraday sparkline."""
    ticks = fetch_intraday(index)
    eod = fetch_eod(index)

    if not ticks and not eod:
        raise PsxUnavailableError(f"No data available for index {index}.")

    if ticks:
        value = ticks[-1][1]
        # Sample the intraday curve down to a chart-friendly number of points.
        step = max(1, len(ticks) // 60)
        sparkline = [round(price, 2) for _, price, _ in ticks[::step]][-60:]
    else:
        value = eod[-1][1]
        sparkline = [round(close, 2) for _, close, _ in eod[-60:]]

    previous_close = None
    if eod:
        today = ticks[-1][0].date() if ticks else eod[-1][0]
        earlier = [close for day, close, _ in eod if day < today]
        previous_close = earlier[-1] if earlier else (eod[-2][1] if len(eod) > 1 else None)

    change = value - previous_close if previous_close else 0.0
    change_pct = (change / previous_close * 100) if previous_close else 0.0

    return {
        "name": index,
        "value": round(value, 2),
        "change": round(change, 2),
        "change_pct": round(change_pct, 2),
        "sparkline": sparkline,
        "history": [(day, close) for day, close, _ in eod[-260:]],
    }


# --------------------------------------------------------------------------
# corporate actions
# --------------------------------------------------------------------------
def fetch_calendar(days_back: int = 7, days_forward: int = 60) -> list[dict[str, Any]]:
    """AGM / EOGM / board meeting calendar in a date window."""
    today = datetime.now(PKT).date()
    payload = {
        "from": (today - timedelta(days=days_back)).isoformat(),
        "to": (today + timedelta(days=days_forward)).isoformat(),
    }
    response = _request("POST", "/calendar", data=payload)
    try:
        items = response.json().get("data") or []
    except json.JSONDecodeError as exc:
        raise PsxUnavailableError("PSX calendar did not return JSON.") from exc

    out = []
    for item in items:
        symbol = normalize_symbol(item.get("symbol"))
        raw_date = str(item.get("date") or "").strip()
        if not symbol or not raw_date:
            continue
        out.append(
            {
                "symbol": symbol,
                "company": str(item.get("name") or "").strip(),
                "event_type": str(item.get("type") or "").strip().upper(),
                "date": raw_date,
                "time": str(item.get("time") or "").strip(),
                "city": str(item.get("city") or "").strip(),
                "period_end": str(item.get("period_end") or "").strip(),
            }
        )
    out.sort(key=lambda row: row["date"])
    logger.info("Corporate calendar: %s events.", len(out))
    return out


_MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11,
    "december": 12,
}


def _parse_announcement_date(text: str) -> date | None:
    """Parse 'August 31, 2026 3:51 PM' into a date."""
    match = re.match(r"([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})", text.strip())
    if not match:
        return None
    month = _MONTHS.get(match.group(1).lower())
    if not month:
        return None
    try:
        return date(int(match.group(3)), month, int(match.group(2)))
    except ValueError:
        return None


def _parse_book_closure(text: str) -> tuple[date | None, date | None]:
    """Parse '22/09/2026  - 28/09/2026' into start and end dates."""
    found = re.findall(r"(\d{2})/(\d{2})/(\d{4})", text or "")
    parsed: list[date] = []
    for day, month, year in found:
        try:
            parsed.append(date(int(year), int(month), int(day)))
        except ValueError:
            continue
    if not parsed:
        return None, None
    return parsed[0], parsed[-1]


def fetch_payouts(year: int | None = None) -> list[dict[str, Any]]:
    """Dividend and bonus announcements with their book closure windows.

    The payouts endpoint rejects an empty POST body with HTTP 469, so the
    year is always supplied.
    """
    today = datetime.now(PKT).date()
    target_year = year or today.year
    html = _request("POST", "/payouts", data={"year": target_year}).text

    out = []
    for cells in _table_rows(html):
        if len(cells) < 6:
            continue
        symbol = normalize_symbol(cells[0])
        if not symbol:
            continue
        announced = _parse_announcement_date(cells[4])
        bc_start, bc_end = _parse_book_closure(cells[5])
        out.append(
            {
                "symbol": symbol,
                "company": cells[1].strip(),
                "sector_name": cells[2].strip(),
                "payout": cells[3].strip(),
                "announced_on": announced.isoformat() if announced else "",
                "book_closure_from": bc_start.isoformat() if bc_start else "",
                "book_closure_to": bc_end.isoformat() if bc_end else "",
            }
        )
    logger.info("Payouts for %s: %s announcements.", target_year, len(out))
    return out


def fetch_upcoming_payouts(days_forward: int = 60, days_back: int = 5) -> list[dict[str, Any]]:
    """Payouts whose book closure falls inside a window around today.

    Spans the year boundary so December book closures are still visible in
    January.
    """
    today = datetime.now(PKT).date()
    window_start = today - timedelta(days=days_back)
    window_end = today + timedelta(days=days_forward)

    rows = fetch_payouts(today.year)
    if window_end.year != today.year:
        try:
            rows += fetch_payouts(window_end.year)
        except PsxUnavailableError:
            logger.warning("Could not load payouts for %s.", window_end.year)

    upcoming = []
    for row in rows:
        raw = row.get("book_closure_from") or ""
        if not raw:
            continue
        try:
            bc = date.fromisoformat(raw)
        except ValueError:
            continue
        if window_start <= bc <= window_end:
            upcoming.append(row)

    upcoming.sort(key=lambda row: row["book_closure_from"])
    return upcoming


# --------------------------------------------------------------------------
# convenience
# --------------------------------------------------------------------------
def halal_symbols() -> set[str]:
    """Symbols in the KMI All Shares Islamic Index, per the exchange itself."""
    return {row["symbol"] for row in fetch_market_watch() if row["is_kmi"]}


def price_map(symbols: Iterable[str] | None = None) -> dict[str, float]:
    """Current price for every symbol, or just the ones requested."""
    snapshot = {row["symbol"]: row["current"] for row in fetch_market_watch()}
    if symbols is None:
        return snapshot
    wanted = {normalize_symbol(s) for s in symbols}
    return {s: p for s, p in snapshot.items() if s in wanted}
