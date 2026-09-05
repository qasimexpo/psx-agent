"""Technical indicators computed from PSX end-of-day closes.

Previously these came from the unofficial TradingView scraper, which returned
HTTP 429 under load and silently dropped symbols. The PSX portal serves a full
end-of-day series per symbol, so the numbers below are derived from first-party
data and are reproducible.

Only closing prices and volume are available in the series, so support and
resistance are swing levels taken from closes rather than intraday pivots. That
is stated in the UI rather than dressed up as something it is not.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import date
from typing import Any, Sequence


@dataclass(slots=True)
class Technicals:
    """Indicator bundle for one symbol."""

    close: float | None = None
    rsi_14: float | None = None
    sma_20: float | None = None
    sma_50: float | None = None
    sma_200: float | None = None
    support: float | None = None
    resistance: float | None = None
    high_52w: float | None = None
    low_52w: float | None = None
    change_1w_pct: float | None = None
    change_1m_pct: float | None = None
    change_3m_pct: float | None = None
    change_1y_pct: float | None = None
    volatility_pct: float | None = None
    avg_volume_30d: int | None = None
    trend: str = "Insufficient data"
    signal: str = "HOLD"
    data_points: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _round(value: float | None, digits: int = 2) -> float | None:
    return round(value, digits) if value is not None else None


def sma(closes: Sequence[float], period: int) -> float | None:
    if len(closes) < period:
        return None
    return sum(closes[-period:]) / period


def rsi(closes: Sequence[float], period: int = 14) -> float | None:
    """Wilder's smoothed RSI."""
    if len(closes) < period + 1:
        return None

    gains = 0.0
    losses = 0.0
    for i in range(1, period + 1):
        delta = closes[i] - closes[i - 1]
        if delta >= 0:
            gains += delta
        else:
            losses -= delta
    avg_gain = gains / period
    avg_loss = losses / period

    for i in range(period + 1, len(closes)):
        delta = closes[i] - closes[i - 1]
        gain = max(delta, 0.0)
        loss = max(-delta, 0.0)
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period

    if avg_loss == 0:
        return 100.0 if avg_gain > 0 else 50.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def pct_change(closes: Sequence[float], lookback: int) -> float | None:
    if len(closes) <= lookback:
        return None
    past = closes[-1 - lookback]
    if past <= 0:
        return None
    return (closes[-1] - past) / past * 100


def volatility(closes: Sequence[float], period: int = 30) -> float | None:
    """Standard deviation of daily returns, as a percentage."""
    if len(closes) < period + 1:
        return None
    window = closes[-(period + 1):]
    returns = [
        (window[i] - window[i - 1]) / window[i - 1]
        for i in range(1, len(window))
        if window[i - 1] > 0
    ]
    if len(returns) < 2:
        return None
    mean = sum(returns) / len(returns)
    variance = sum((r - mean) ** 2 for r in returns) / (len(returns) - 1)
    return (variance ** 0.5) * 100


def swing_levels(closes: Sequence[float], lookback: int = 60) -> tuple[float | None, float | None]:
    """Nearest support below and resistance above the latest close.

    Uses the recent trading range: support is the lowest close in the window,
    resistance the highest. If price is already at an extreme, the opposite end
    of the window is used so a level is always actionable.
    """
    if len(closes) < 10:
        return None, None
    window = closes[-lookback:] if len(closes) >= lookback else list(closes)
    latest = closes[-1]
    low = min(window)
    high = max(window)

    below = [c for c in window if c < latest * 0.995]
    above = [c for c in window if c > latest * 1.005]

    support = max(below) if below else low
    resistance = min(above) if above else high

    # Collapse degenerate levels onto the window extremes.
    if support >= latest:
        support = low
    if resistance <= latest:
        resistance = high
    return support, resistance


def classify_trend(close: float, s20: float | None, s50: float | None, s200: float | None) -> str:
    if s20 is None or s50 is None:
        return "Insufficient data"
    if close > s20 > s50 and (s200 is None or close > s200):
        return "Strong uptrend"
    if close > s20 and close > s50:
        return "Uptrend"
    if close < s20 < s50 and (s200 is None or close < s200):
        return "Strong downtrend"
    if close < s20 and close < s50:
        return "Downtrend"
    return "Sideways"


def derive_signal(rsi_value: float | None, trend: str) -> str:
    """A transparent, rules-based signal.

    This is deliberately mechanical. The AI layer sees it as one input among
    several rather than being asked to invent a recommendation from nothing.
    """
    if rsi_value is None:
        return "HOLD"
    if rsi_value < 30 and trend in {"Uptrend", "Strong uptrend", "Sideways"}:
        return "ACCUMULATE"
    if rsi_value < 30:
        return "WATCH"
    if rsi_value > 70 and trend in {"Downtrend", "Strong downtrend"}:
        return "REDUCE"
    if rsi_value > 70:
        return "TAKE PROFIT"
    if trend in {"Strong uptrend", "Uptrend"}:
        return "HOLD"
    if trend in {"Strong downtrend", "Downtrend"}:
        return "CAUTION"
    return "HOLD"


def compute(series: Sequence[tuple[date, float, int]]) -> Technicals:
    """Build the indicator bundle from an end-of-day series (oldest first)."""
    if not series:
        return Technicals()

    closes = [close for _, close, _ in series]
    volumes = [vol for _, _, vol in series]
    latest = closes[-1]

    s20 = sma(closes, 20)
    s50 = sma(closes, 50)
    s200 = sma(closes, 200)
    support, resistance = swing_levels(closes)
    year = closes[-252:] if len(closes) >= 252 else closes
    rsi_value = rsi(closes)
    trend = classify_trend(latest, s20, s50, s200)

    recent_volumes = [v for v in volumes[-30:] if v > 0]

    return Technicals(
        close=_round(latest),
        rsi_14=_round(rsi_value, 1),
        sma_20=_round(s20),
        sma_50=_round(s50),
        sma_200=_round(s200),
        support=_round(support),
        resistance=_round(resistance),
        high_52w=_round(max(year)),
        low_52w=_round(min(year)),
        change_1w_pct=_round(pct_change(closes, 5), 1),
        change_1m_pct=_round(pct_change(closes, 21), 1),
        change_3m_pct=_round(pct_change(closes, 63), 1),
        change_1y_pct=_round(pct_change(closes, 252), 1),
        volatility_pct=_round(volatility(closes), 1),
        avg_volume_30d=int(sum(recent_volumes) / len(recent_volumes)) if recent_volumes else None,
        trend=trend,
        signal=derive_signal(rsi_value, trend),
        data_points=len(closes),
    )


def summarize_for_prompt(symbol: str, tech: Technicals) -> str:
    """One compact line per symbol for the LLM context."""

    def fmt(value: float | None, suffix: str = "") -> str:
        return f"{value}{suffix}" if value is not None else "n/a"

    return (
        f"{symbol}: close={fmt(tech.close)} RSI14={fmt(tech.rsi_14)} "
        f"SMA20={fmt(tech.sma_20)} SMA50={fmt(tech.sma_50)} SMA200={fmt(tech.sma_200)} "
        f"support={fmt(tech.support)} resistance={fmt(tech.resistance)} "
        f"52w={fmt(tech.low_52w)}-{fmt(tech.high_52w)} "
        f"1M={fmt(tech.change_1m_pct, '%')} 1Y={fmt(tech.change_1y_pct, '%')} "
        f"vol30d={fmt(tech.avg_volume_30d)} trend={tech.trend} rule_signal={tech.signal}"
    )
