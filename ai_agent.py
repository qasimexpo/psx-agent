"""
AI agent for generating PSX portfolio HTML reports and analysis via Groq (primary) and Gemini (fallback).
"""

import json
import logging
import re
import time
from html import escape
from typing import Any

import google.generativeai as genai
from groq import Groq

from fetchers import (
    _format_pkr,
    fetch_live_prices_for_symbols,
    fetch_psx_kse100_quote_map,
    normalize_psx_symbol,
)

GROQ_FALLBACK_MODELS = ("llama-3.1-8b-instant", "llama-3.3-70b-versatile")
GEMINI_FALLBACK_MODELS = ("gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash")
GROQ_MODEL_ALIASES = {
    "llama3-8b-8192": "llama-3.1-8b-instant",
    "llama3-70b-8192": "llama-3.3-70b-versatile",
}
logger = logging.getLogger("smartsarmaya.ai")

TOP_PICKS_COUNT = 6
SECTOR_PICKS_COUNT = 3
TIMEFRAME_PICK_LABELS = {"daily": "Daily", "monthly": "Monthly", "yearly": "Yearly"}

SECTOR_FALLBACK_SYMBOLS: dict[str, list[str]] = {
    "Banking (Islamic)": ["MEBL", "BAHL", "AKBL"],
    "Cement": ["LUCK", "DGKC", "MLCF"],
    "Energy (E&P)": ["OGDC", "PPL", "MARI"],
    "Power Generation": ["HUBC", "KAPCO", "NCPL"],
    "Technology": ["SYS", "TRG", "AVN"],
    "Fertilizer": ["EFERT", "FFC", "FATIMA"],
    "Pharmaceuticals": ["SEARL", "GLAXO", "AGP"],
    "Automobile": ["INDU", "PSMC", "HCAR"],
    "Textile": ["GATM", "NML", "NCL"],
    "Food & Personal Care": ["ENGRO", "UNITY", "NESTLE"],
}
TIMEFRAME_LABELS = {"1d": "Daily", "1W": "Weekly", "1M": "Monthly"}

_AI_RESPONSE_CACHE: dict[str, tuple[Any, float]] = {}
TOP_PICKS_CACHE_KEY = "top_picks_daily_v3"
TOP_PICKS_CACHE_TTL_SECONDS = 6 * 60 * 60
SINGLE_STOCK_CACHE_TTL_SECONDS = 20 * 60


def get_ai_cached(key: str, ttl_seconds: int) -> Any | None:
    """Return a cached AI response when still within TTL."""
    entry = _AI_RESPONSE_CACHE.get(key)
    if entry and time.time() - entry[1] < ttl_seconds:
        return entry[0]
    return None


def set_ai_cached(key: str, value: Any) -> None:
    """Store an AI response in the in-memory cache."""
    _AI_RESPONSE_CACHE[key] = (value, time.time())


def _ensure_groq_api_key(api_key: str) -> None:
    if not str(api_key or "").strip():
        raise ValueError("Missing required environment variable: GROQ_API_KEY")


def _unique_models(primary: str, fallbacks: tuple[str, ...]) -> list[str]:
    primary = GROQ_MODEL_ALIASES.get(primary.strip(), primary.strip())
    seen: set[str] = set()
    models: list[str] = []
    for model in (primary, *fallbacks):
        resolved = GROQ_MODEL_ALIASES.get(model, model)
        if resolved and resolved not in seen:
            seen.add(resolved)
            models.append(resolved)
    return models


def _call_groq_chat(
    *,
    groq_api_key: str,
    model_name: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
) -> str:
    client = Groq(api_key=groq_api_key)
    response = client.chat.completions.create(
        model=model_name,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return (response.choices[0].message.content or "").strip()


def _call_gemini_chat(
    *,
    gemini_api_key: str,
    model_name: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
) -> str:
    genai.configure(api_key=gemini_api_key)
    model = genai.GenerativeModel(
        model_name=model_name,
        system_instruction=system_prompt,
    )
    response = model.generate_content(
        user_prompt,
        generation_config={
            "temperature": temperature,
            "max_output_tokens": max_tokens,
            "response_mime_type": "application/json",
        },
    )
    return (response.text or "").strip()


def _call_llm_json(
    *,
    groq_api_key: str,
    gemini_api_key: str | None,
    model_name: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
) -> str:
    """Call Groq first, then optional Gemini fallback; return raw JSON text."""
    _ensure_groq_api_key(groq_api_key)
    full_user_prompt = f"{user_prompt.rstrip()}\n\nReturn ONLY raw JSON. No markdown fences."
    errors: list[str] = []

    for candidate in _unique_models(model_name, GROQ_FALLBACK_MODELS):
        try:
            text = _call_groq_chat(
                groq_api_key=groq_api_key,
                model_name=candidate,
                system_prompt=system_prompt,
                user_prompt=full_user_prompt,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            if text:
                if candidate != model_name:
                    logger.info(
                        "Groq fallback model used: %s (configured: %s)",
                        candidate,
                        model_name,
                    )
                return text
        except Exception as exc:
            logger.exception("Groq model %s failed: %s", candidate, exc)
            errors.append(f"Groq/{candidate}: {exc}")

    if gemini_api_key:
        for candidate in GEMINI_FALLBACK_MODELS:
            try:
                text = _call_gemini_chat(
                    gemini_api_key=gemini_api_key,
                    model_name=candidate,
                    system_prompt=system_prompt,
                    user_prompt=full_user_prompt,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
                if text:
                    logger.info("Gemini fallback model used: %s", candidate)
                    return text
            except Exception as exc:
                logger.exception("Gemini model %s failed: %s", candidate, exc)
                errors.append(f"Gemini/{candidate}: {exc}")

    raise RuntimeError("All LLM providers failed: " + "; ".join(errors[:3]))

SYSTEM_PROMPT_TEMPLATE = """You are the Chief Risk Officer (CRO) of an institutional PSX portfolio desk briefing client: {client_name}.

Your role is to protect capital, monitor sector concentration, track CGT holding periods, and deliver actionable risk-adjusted guidance on the Pakistan Stock Exchange (PSX) for this client only.

You are analyzing this data on a [{timeframe}] chart interval. Adjust your buy/sell/hold strategy accordingly (e.g., '1W' means swing trading, '1M' means long-term investing).

Important rules:
- Open the html_email with a warm personalized greeting: "Assalamu Alaikum {client_name}, here is your specific portfolio review..."
- Immediately after the greeting, include a Methodology Badge as the first visible content block:
  <strong>Analysis Mode: {timeframe_label} Chart | Indicators Used: RSI (14), Pivot Points (S1/R1)</strong>
- Analyze ONLY this client's holdings and totals — do not reference other clients or portfolios.
- Use the exact Qty, P/L (PKR), P/E, EPS, and holding period values provided — do not recalculate them differently.
- Compare each holding's current price vs buy price and support/resistance (R1/S1) when choosing Action and Target Exit Price.
- If any sector exceeds 40% of this client's portfolio value, display a prominent "⚠️ RISK WARNING" banner at the top of the HTML report.
- Write in a professional, institutional tone — like a CRO briefing the client directly.
- Output ONLY a valid JSON object with exactly two keys: "html_email" and "telegram_summary".
- The html_email value must be clean HTML suitable for an email body with inline CSS only.
- The telegram_summary value must be short Markdown with emojis, address {client_name} by name, suitable for Telegram parse_mode=Markdown.
- Do NOT include markdown code fences, <script> tags, or external CSS/JS links in html_email.

STRICTLY FORBIDDEN in html_email:
- Do NOT generate "Top 5 Picks", "Shariah-Compliant Picks", or any stock recommendation lists outside the client's holdings.
- Do NOT generate "News Summary", "Dividends", or "Board Meetings" sections.
These are served by separate API endpoints; duplicating them wastes tokens and confuses users.

The html_email MUST include ONLY these sections with clear headings:

0. Portfolio Summary — after the Methodology Badge, show:
   - Total Portfolio Value (PKR)
   - Total Unrealized P/L (PKR)
   - Sector allocation table or list with percentages
   - If any sector > 40%, a prominent "⚠️ RISK WARNING" banner

1. Portfolio Action Plan — HTML table with EXACTLY these columns in order:
   Symbol | Current Price | RSI | S1 (Support) | R1 (Resistance) | P/L (PKR) | Action | Qty to Sell | Target Buy Zone | Exit Target
   - Current Price: use provided live market data only (no invented values).
   - RSI, S1 (Support), R1 (Resistance): use exact numeric values from provided technical data (use "N/A" only when missing; never invent).
   - Action MUST be exactly one of: Buy More, Hold, Sell Partial, Sell All.
   - Qty to Sell: only populate for Sell Partial (e.g. "Sell 50%"), otherwise "-".
   - Target Buy Zone: only populate for Buy More (specific numeric price range), otherwise "-".
   - Exit Target: provide an exact numeric target for taking profit/cutting loss.
   - Include EVERY symbol from technical data — do not skip any row.

The telegram_summary MUST include:
- Greeting addressing {client_name} and report date with total portfolio P/L (with emoji)
- Chart interval ({timeframe_label}) noted briefly
- Any critical sector RISK WARNING if >40%
- Top 2-3 immediate actionable alerts (stop loss, take profit, exit signals)
- Keep under 3500 characters; use Telegram Markdown (*bold*, _italic_)
"""


def _build_system_prompt(client_name: str, timeframe: str = "1d") -> str:
    return SYSTEM_PROMPT_TEMPLATE.format(
        client_name=client_name,
        timeframe=timeframe,
        timeframe_label=TIMEFRAME_LABELS.get(timeframe, "Daily"),
    )


def _build_methodology_badge_html(timeframe: str = "1d") -> str:
    label = TIMEFRAME_LABELS.get(timeframe, "Daily")
    return f"""
    <div style="background:#ecfdf5;border:1px solid #10b981;color:#065f46;
                padding:12px 16px;border-radius:8px;margin:16px 0;font-size:14px;">
        <strong>Analysis Mode: {escape(label)} Chart | Indicators Used: RSI (14), Pivot Points (S1/R1)</strong>
    </div>"""


def _format_indicator_value(value: Any) -> str:
    if value is None:
        return "N/A"
    try:
        return f"{float(value):,.2f}"
    except (TypeError, ValueError):
        return str(value)


def _strip_markdown_fences(text: str) -> str:
    """Remove accidental markdown code fences from AI output."""
    text = text.strip()
    text = re.sub(r"^```(?:json|html)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _wrap_html_document(body: str) -> str:
    """Wrap HTML fragment in a minimal email-safe document shell."""
    if "<html" in body.lower():
        return body
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:860px;margin:0 auto;padding:20px;">
{body}
</body>
</html>"""


def _format_pe_eps_col(row: dict[str, Any]) -> str:
    pe = row.get("pe_ratio", "N/A")
    eps = row.get("eps", "N/A")
    if pe == "N/A" and eps == "N/A":
        return "N/A"
    if eps != "N/A":
        return f"{pe} / EPS {eps}"
    return str(pe)


def _format_holding_col(row: dict[str, Any]) -> str:
    days = row.get("holding_days")
    cgt = row.get("cgt_status", "N/A")
    if days is None or cgt == "N/A":
        return "N/A"
    return f"{days} days — {cgt}"


def _fallback_exit_price(row: dict[str, Any]) -> str:
    r1 = row.get("r1")
    s1 = row.get("s1")
    if r1 is not None and s1 is not None:
        return f"Take profit near {r1:.2f}; cut below {s1:.2f}"
    if r1 is not None:
        return f"Take profit near {r1:.2f}"
    if s1 is not None:
        return f"Cut loss below {s1:.2f}"
    return "N/A"


def fallback_action(row: dict[str, Any]) -> str:
    """Rule-based holding action for API and fallback reports."""
    current = row.get("current_price")
    buy = row.get("buy_price")
    s1 = row.get("s1")
    r1 = row.get("r1")
    if current is not None and s1 is not None and current <= s1:
        return "Exit — stop loss zone"
    if current is not None and r1 is not None and current >= r1:
        return "Take profit"
    if current is not None and buy is not None and current < buy:
        return "Monitor — underwater"
    return "Hold"


def build_holdings_from_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Build structured holding rows for the API response."""
    holdings: list[dict[str, Any]] = []
    for row in rows:
        holdings.append(
            {
                "symbol": row["symbol"],
                "quantity": row["quantity"],
                "buy_price": row["buy_price"],
                "live_price": row.get("current_price"),
                "pl_pkr": row.get("pl_amount"),
                "rsi": row.get("rsi"),
                "s1": row.get("s1"),
                "r1": row.get("r1"),
                "ai_action": fallback_action(row),
            }
        )
    return holdings


def build_risk_summary(portfolio_summary: dict[str, Any]) -> str:
    """Build a plain-text risk summary from portfolio totals."""
    lines = [
        f"Total Portfolio Value (PKR): Rs. {portfolio_summary['total_portfolio_value_pkr']:,.0f}",
        f"Total Unrealized P/L (PKR): {_format_pkr(portfolio_summary['total_unrealized_pl_pkr'])}",
        "Sector Allocation:",
    ]
    for sector, pct in sorted(
        portfolio_summary.get("sector_allocation", {}).items(), key=lambda x: -x[1]
    ):
        lines.append(f"  - {sector}: {pct:.1f}%")

    if portfolio_summary.get("risk_warnings"):
        lines.append("")
        lines.append("RISK WARNINGS (>40% sector concentration):")
        for warning in portfolio_summary["risk_warnings"]:
            lines.append(f"  - {warning}")
    else:
        lines.append("")
        lines.append("RISK WARNINGS: None (all sectors within 40% limit).")

    return "\n".join(lines)


def _build_sector_summary_html(summary: dict[str, Any]) -> str:
    rows = ""
    for sector, pct in sorted(
        summary.get("sector_allocation", {}).items(), key=lambda x: -x[1]
    ):
        rows += f"""
        <tr>
            <td style="padding:6px 8px;border:1px solid #e5e7eb;">{escape(sector)}</td>
            <td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:right;">{pct:.1f}%</td>
        </tr>"""

    warning_banner = ""
    if summary.get("risk_warnings"):
        warnings = "; ".join(summary["risk_warnings"])
        warning_banner = f"""
        <div style="background:#fef2f2;border:2px solid #dc2626;color:#991b1b;
                    padding:14px;border-radius:8px;margin:16px 0;font-weight:bold;">
            ⚠️ RISK WARNING — Sector concentration exceeds 40%: {escape(warnings)}
        </div>"""

    total_value = summary.get("total_portfolio_value_pkr", 0)
    total_pl = _format_pkr(summary.get("total_unrealized_pl_pkr"))

    return f"""
    {warning_banner}
    <div style="background:#f9fafb;padding:16px;border-radius:8px;margin-bottom:20px;">
        <p style="margin:0 0 8px;"><strong>Total Portfolio Value (PKR):</strong> Rs. {total_value:,.0f}</p>
        <p style="margin:0 0 12px;"><strong>Total Unrealized P/L (PKR):</strong> {escape(total_pl)}</p>
        <table style="border-collapse:collapse;font-size:13px;">
            <thead>
                <tr style="background:#e5e7eb;">
                    <th style="padding:6px 8px;border:1px solid #d1d5db;">Sector</th>
                    <th style="padding:6px 8px;border:1px solid #d1d5db;">Allocation</th>
                </tr>
            </thead>
            <tbody>{rows}</tbody>
        </table>
    </div>"""


def _build_fallback_telegram_summary(
    client_name: str,
    report_date: str,
    technical_rows: list[dict[str, Any]],
    summary: dict[str, Any],
) -> str:
    total_pl = _format_pkr(summary.get("total_unrealized_pl_pkr"))
    lines = [
        f"📊 *PSX Risk Brief — {client_name}*",
        f"📅 {report_date}",
        f"💰 Total P/L: *{total_pl}*",
    ]

    if summary.get("risk_warnings"):
        lines.append("")
        lines.append("⚠️ *RISK WARNING*")
        for warning in summary["risk_warnings"]:
            lines.append(f"• {warning}")

    alerts: list[tuple[float, str]] = []
    for row in technical_rows:
        symbol = row["symbol"]
        action = fallback_action(row)
        current = row.get("current_price")
        s1 = row.get("s1")
        r1 = row.get("r1")

        if "Exit" in action or "Take profit" in action:
            priority = abs(row.get("pl_amount") or 0)
            alerts.append((priority, f"• *{symbol}*: {action} (now {current})"))
        elif current is not None and s1 is not None and current <= s1 * 1.02:
            alerts.append(
                (abs(row.get("pl_amount") or 0), f"• *{symbol}*: Near stop {s1:.2f}")
            )
        elif current is not None and r1 is not None and current >= r1 * 0.98:
            alerts.append(
                (abs(row.get("pl_amount") or 0), f"• *{symbol}*: Near target {r1:.2f}")
            )

    alerts.sort(key=lambda x: -x[0])
    if alerts:
        lines.append("")
        lines.append("🚨 *Top Alerts*")
        for _, alert in alerts[:3]:
            lines.append(alert)
    else:
        lines.append("")
        lines.append("✅ No immediate stop/target triggers.")

    return "\n".join(lines)


def _build_fallback_report(
    client_name: str,
    report_date: str,
    technical_rows: list[dict[str, Any]],
    news: list[dict[str, str]],
    psx_events: dict[str, Any],
    portfolio_summary: dict[str, Any],
    timeframe: str = "1d",
) -> dict[str, str]:
    """Build HTML email and Telegram summary when Gemini is unavailable."""
    table_rows = ""

    for row in technical_rows:
        symbol = row["symbol"]
        pl_pkr = _format_pkr(row.get("pl_amount"))
        exit_price = _fallback_exit_price(row)
        action = fallback_action(row)

        table_rows += f"""
        <tr>
            <td style="padding:8px;border:1px solid #e5e7eb;"><strong>{escape(symbol)}</strong></td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">{escape(str(row.get('current_price', 'N/A')))}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">{escape(_format_indicator_value(row.get('rsi')))}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">{escape(_format_indicator_value(row.get('s1')))}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">{escape(_format_indicator_value(row.get('r1')))}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">{escape(pl_pkr)}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">{escape(action)}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">-</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">-</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">{escape(exit_price)}</td>
        </tr>"""

    summary_html = _build_sector_summary_html(portfolio_summary)
    methodology_badge = _build_methodology_badge_html(timeframe)

    body = f"""
    <h1 style="color:#111827;">PSX AI Risk Brief — {escape(client_name)}</h1>
    <p style="font-size:15px;margin-bottom:16px;">
        Assalamu Alaikum <strong>{escape(client_name)}</strong>, here is your specific portfolio review for {escape(report_date)}.
    </p>
    {methodology_badge}
    <p style="color:#b45309;background:#fffbeb;padding:12px;border-radius:6px;">
        AI analysis was unavailable. Showing fetched data with rule-based alerts below.
    </p>

    <h2>Portfolio Summary</h2>
    {summary_html}

    <h2>Portfolio Action Plan</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
            <tr style="background:#f3f4f6;">
                <th style="padding:8px;border:1px solid #e5e7eb;">Symbol</th>
                <th style="padding:8px;border:1px solid #e5e7eb;">Current Price</th>
                <th style="padding:8px;border:1px solid #e5e7eb;">RSI</th>
                <th style="padding:8px;border:1px solid #e5e7eb;">S1 (Support)</th>
                <th style="padding:8px;border:1px solid #e5e7eb;">R1 (Resistance)</th>
                <th style="padding:8px;border:1px solid #e5e7eb;">P/L (PKR)</th>
                <th style="padding:8px;border:1px solid #e5e7eb;">Action</th>
                <th style="padding:8px;border:1px solid #e5e7eb;">Qty to Sell</th>
                <th style="padding:8px;border:1px solid #e5e7eb;">Target Buy Zone</th>
                <th style="padding:8px;border:1px solid #e5e7eb;">Exit Target</th>
            </tr>
        </thead>
        <tbody>{table_rows}</tbody>
    </table>
    """

    return {
        "html_email": _wrap_html_document(body),
        "telegram_summary": _build_fallback_telegram_summary(
            client_name, report_date, technical_rows, portfolio_summary
        ),
    }


def _parse_report_json(raw: str) -> dict[str, str]:
    """Parse and validate the Gemini JSON response."""
    text = _strip_markdown_fences(raw)
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("Response is not a JSON object")
    html_email = data.get("html_email", "").strip()
    telegram_summary = data.get("telegram_summary", "").strip()
    if not html_email or not telegram_summary:
        raise ValueError("Missing html_email or telegram_summary keys")
    return {
        "html_email": _wrap_html_document(html_email),
        "telegram_summary": telegram_summary,
    }


def generate_report(
    groq_api_key: str,
    model_name: str,
    client_name: str,
    report_date: str,
    technical_text: str,
    technical_rows: list[dict[str, Any]],
    portfolio_summary_text: str,
    portfolio_summary: dict[str, Any],
    news: list[dict[str, str]],
    news_text: str,
    psx_events: dict[str, Any],
    gemini_api_key: str | None = None,
    timeframe: str = "1d",
) -> dict[str, str]:
    """
    Generate HTML email and Telegram summary using Gemini.

    Falls back to rule-based templates if the AI call fails.
    """
    timeframe_label = TIMEFRAME_LABELS.get(timeframe, "Daily")
    user_prompt = f"""Generate today's PSX institutional risk briefing for client: {client_name}.

Report Date (PKT): {report_date}
Client Name: {client_name}
Chart Interval: {timeframe} ({timeframe_label})

=== PORTFOLIO SUMMARY (use these totals exactly) ===
{portfolio_summary_text}

=== TECHNICAL & FUNDAMENTAL DATA (use Qty, P/L PKR, P/E, EPS, Holding Period, RSI, S1, R1 exactly) ===
{technical_text}

=== PORTFOLIO UPCOMING EVENTS (Upcoming Events column) ===
{psx_events.get('portfolio_events_text', 'No events in +/-15 day window.')}

Return ONLY a JSON object with two keys:
1. "html_email" — full HTML report with inline CSS and ONLY the required portfolio sections
2. "telegram_summary" — short emoji-rich Markdown for Telegram

Rules:
- Greet {client_name} by name at the start of html_email.
- Immediately after greeting, include Methodology Badge:
  Analysis Mode: {timeframe_label} Chart | Indicators Used: RSI (14), Pivot Points (S1/R1)
- You are analyzing on a [{timeframe}] chart interval. Adjust strategy accordingly ('1W' = swing trading, '1M' = long-term investing).
- Analyze ONLY this client's portfolio — not any other client.
- Portfolio Action Plan must use exactly 10 columns in this order:
  Symbol | Current Price | RSI | S1 (Support) | R1 (Resistance) | P/L (PKR) | Action | Qty to Sell | Target Buy Zone | Exit Target.
- RSI, S1, R1 must be exact numeric values from technical data (use "N/A" only when missing).
- Action must be one of: Buy More, Hold, Sell Partial, Sell All.
- Qty to Sell only for Sell Partial; otherwise "-".
- Target Buy Zone only for Buy More; otherwise "-".
- Use provided totals, Qty, P/L (PKR), P/E, EPS, and Holding Period verbatim.
- Show ⚠️ RISK WARNING banner if any sector exceeds 40%.
- Current Price must use provided live data only (never invent values).
- STRICTLY FORBIDDEN: Do NOT include Top 5 Picks, News Summary, Dividends, or Board Meetings sections.
- telegram_summary: address {client_name}, note {timeframe_label} interval, total P/L, risk warnings, top 2-3 actionable alerts from holdings only."""

    system_prompt = _build_system_prompt(client_name, timeframe)

    try:
        raw = _call_llm_json(
            groq_api_key=groq_api_key,
            gemini_api_key=gemini_api_key,
            model_name=model_name,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.4,
            max_tokens=8192,
        )
        return _parse_report_json(raw)
    except Exception as exc:
        logger.exception("All LLM providers failed for portfolio report: %s", exc)

    logger.warning("Using fallback portfolio report template.")
    return _build_fallback_report(
        client_name,
        report_date,
        technical_rows,
        news,
        psx_events,
        portfolio_summary,
        timeframe=timeframe,
    )


def generate_portfolio_html(
    groq_api_key: str,
    model_name: str,
    report_date: str,
    technical_text: str,
    technical_rows: list[dict[str, Any]],
    portfolio_summary_text: str,
    portfolio_summary: dict[str, Any],
    news: list[dict[str, str]],
    news_text: str,
    psx_events: dict[str, Any],
    client_name: str = "Investor",
    gemini_api_key: str | None = None,
    timeframe: str = "1d",
) -> str:
    """Generate portfolio analysis HTML for the API (no Telegram delivery)."""
    report = generate_report(
        groq_api_key=groq_api_key,
        model_name=model_name,
        client_name=client_name,
        report_date=report_date,
        technical_text=technical_text,
        technical_rows=technical_rows,
        portfolio_summary_text=portfolio_summary_text,
        portfolio_summary=portfolio_summary,
        news=news,
        news_text=news_text,
        psx_events=psx_events,
        gemini_api_key=gemini_api_key,
        timeframe=timeframe,
    )
    return report["html_email"]


def generate_report_html(
    groq_api_key: str,
    model_name: str,
    report_date: str,
    technical_text: str,
    technical_rows: list[dict[str, Any]],
    news: list[dict[str, str]],
    news_text: str,
    psx_events: dict[str, Any],
    client_name: str = "Client",
    gemini_api_key: str | None = None,
) -> str:
    """Backward-compatible wrapper returning only the HTML email body."""
    from fetchers import compute_portfolio_summary, format_portfolio_summary_for_prompt

    summary = compute_portfolio_summary(technical_rows)
    return generate_portfolio_html(
        groq_api_key=groq_api_key,
        model_name=model_name,
        report_date=report_date,
        technical_text=technical_text,
        technical_rows=technical_rows,
        portfolio_summary_text=format_portfolio_summary_for_prompt(summary),
        portfolio_summary=summary,
        news=news,
        news_text=news_text,
        psx_events=psx_events,
        client_name=client_name,
        gemini_api_key=gemini_api_key,
    )


TOP_PICKS_SYSTEM_PROMPT = """You are a PSX equity research analyst producing Shariah-compliant stock pick lists for the Pakistan Stock Exchange.

Rules:
- Base all picks on the provided news headlines and current PSX market context.
- Clearly label recommendations as AI investment suggestions, NOT religious rulings or fatwas.
- Output ONLY a valid JSON object with exactly one key: "report_html".
- The report_html value must be clean HTML with inline CSS only.
- Do NOT include markdown code fences, <script> tags, or external CSS/JS links.

The report_html MUST include these three sections with clear headings:

1. Daily Top 5 Picks — HTML table with columns:
   Ticker | Thesis | Current Price | Suggested Buy Price | Exit Target | Risk Note

2. Weekly Top 5 Picks — HTML table with the same columns.

3. Monthly Top 5 Picks — HTML table with the same columns.

Each section must contain exactly 5 rows. Use professional, institutional tone.
- STRICT PRICE RULE: DO NOT hallucinate or guess current stock prices.
- If a recommended stock is not in provided live/portfolio data, set Current Price to "Check Market".
- For non-portfolio picks, express suggested buy/exit as percentages (e.g., "Buy on 5% dip", "Target +15%"), not fake numeric prices.
"""


def _build_fallback_top_picks_html(
    report_date: str,
    news: list[dict[str, str]],
) -> str:
    """Build a rule-based top picks HTML block when Gemini is unavailable."""
    news_items = ""
    for item in news:
        news_items += f"<li>{escape(item['title'])}</li>"
    if not news_items:
        news_items = "<li>No headlines available.</li>"

    body = f"""
    <h1 style="color:#111827;">PSX Top 5 Picks — {escape(report_date)}</h1>
    <p style="color:#b45309;background:#fffbeb;padding:12px;border-radius:6px;">
        AI analysis was unavailable. Showing today's news headlines for context.
    </p>

    <h2>Daily Top 5 Picks</h2>
    <p>AI recommendations unavailable in fallback mode.</p>

    <h2>Weekly Top 5 Picks</h2>
    <p>AI recommendations unavailable in fallback mode.</p>

    <h2>Monthly Top 5 Picks</h2>
    <p>AI recommendations unavailable in fallback mode.</p>

    <h2>Yearly Top 5 Picks</h2>
    <p>AI recommendations unavailable in fallback mode.</p>

    <h2>Today's PSX News Headlines</h2>
    <ul>{news_items}</ul>
    """
    return _wrap_html_document(body)


def _parse_top_picks_json(raw: str) -> str:
    """Parse and validate the Gemini top-picks JSON response."""
    text = _strip_markdown_fences(raw)
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("Response is not a JSON object")
    report_html = data.get("report_html", "").strip()
    if not report_html:
        raise ValueError("Missing report_html key")
    return _wrap_html_document(report_html)


def generate_top_picks_html(
    groq_api_key: str,
    model_name: str,
    report_date: str,
    news: list[dict[str, str]],
    news_text: str,
    gemini_api_key: str | None = None,
) -> str:
    """Generate Daily/Weekly/Monthly Top 5 Picks HTML using Groq."""
    user_prompt = f"""Generate today's PSX Top 5 Picks report.

Report Date (PKT): {report_date}

=== NEWS HEADLINES ===
{news_text}

Return ONLY a JSON object with one key:
"report_html" — full HTML report with inline CSS and all three required sections
(Daily Top 5, Weekly Top 5, Monthly Top 5).

Rules:
- Each section must have exactly 5 picks in a table.
- Base picks on the news headlines and current PSX market trends.
- Label as AI investment suggestions, not religious rulings."""

    try:
        raw = _call_llm_json(
            groq_api_key=groq_api_key,
            gemini_api_key=gemini_api_key,
            model_name=model_name,
            system_prompt=TOP_PICKS_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.4,
            max_tokens=16384,
        )
        return _parse_top_picks_json(raw)
    except Exception as exc:
        logger.exception("All LLM providers failed for top picks HTML: %s", exc)

    logger.warning("Using fallback top picks template.")
    return _build_fallback_top_picks_html(report_date, news)


TOP_PICKS_STRUCTURED_SYSTEM_PROMPT = """You are a PSX equity research analyst producing Shariah-compliant stock picks for the Pakistan Stock Exchange.

Rules:
- Base all picks on the provided news headlines and current PSX market context.
- Clearly label recommendations as AI investment suggestions, NOT religious rulings or fatwas.
- Output ONLY a valid JSON object with keys: "report_html", "daily_picks", "monthly_picks", "yearly_picks".
- The report_html must include Daily, Monthly, and Yearly Top 5 sections as HTML tables.
- Each picks array must contain exactly 5 objects for its horizon.
- Use professional, institutional tone.
"""


TOP_PICK_SYMBOL_SELECTION_SYSTEM_PROMPT = f"""You are a PSX equity research analyst.

Task:
- Analyze provided PSX news headlines and return ONLY {TOP_PICKS_COUNT} PSX ticker symbols as JSON.

Output rules:
- Output ONLY a JSON object with key "symbols".
- "symbols" must be an array of exactly {TOP_PICKS_COUNT} uppercase PSX tickers.
- Do not include explanations, markdown, or code fences.
"""


TOP_PICKS_WITH_LIVE_PRICES_SYSTEM_PROMPT = f"""You are a PSX equity research analyst producing Shariah-compliant stock picks for the Pakistan Stock Exchange.

Rules:
- Output ONLY a valid JSON object with keys: "daily_picks", "monthly_picks", "yearly_picks".
- Each picks array must contain exactly {TOP_PICKS_COUNT} objects using ONLY the {TOP_PICKS_COUNT} provided symbols (reorder per horizon is fine; no extra tickers).
- CRITICAL: Use exact LIVE_PRICES_DATA values for current_price. Never invent prices.
- If LIVE_PRICES_DATA shows "N/A", set current_price to "N/A" and use percentage-style buy/exit targets.
- buy_zone and exit_target must be actionable (numeric PKR when price known, otherwise percentages).
- Each pick object: symbol, sector, summary, why, outlook_short, outlook_long, buy_zone, current_price, exit_target.
- Keep summaries concise (1-2 sentences). Professional tone; AI suggestions only (not fatwas).
"""

TOP_PICKS_CRON_MAX_TOKENS = 4096


SINGLE_STOCK_DEEP_DIVE_SYSTEM_PROMPT = """You are a PSX single-stock analyst producing a concise institutional deep-dive.

You are analyzing this data on a [{timeframe}] chart interval. Adjust your buy/sell/hold strategy accordingly (e.g., '1W' means swing trading, '1M' means long-term investing).

Rules:
- Output ONLY valid JSON with keys:
  "symbol", "current_price", "target_price", "weightage_recommendation", "future_outlook", "action".
- Use the provided live market data exactly for current_price.
- NEVER hallucinate or guess prices.
- target_price must be derived from provided Resistance 1 and risk context.
- weightage_recommendation must be a percentage string (example: "8% - 12%").
- future_outlook must be 2-3 sentences grounded in provided PSX context/news and the chart interval.
- action must be one of: STRONG BUY, BUY, HOLD, SELL.
"""

_PICK_ITEM_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "symbol": {"type": "STRING"},
        "sector": {"type": "STRING"},
        "summary": {"type": "STRING"},
        "why": {"type": "STRING"},
        "outlook_short": {"type": "STRING"},
        "outlook_long": {"type": "STRING"},
        "buy_zone": {"type": "STRING"},
        "current_price": {"type": "STRING"},
        "exit_target": {"type": "STRING"},
    },
    "required": [
        "symbol",
        "sector",
        "summary",
        "why",
        "outlook_short",
        "outlook_long",
        "buy_zone",
        "current_price",
        "exit_target",
    ],
}


def _parse_top_pick_symbols_json(raw: str) -> list[str]:
    text = _strip_markdown_fences(raw)
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        logger.error("Top-pick symbol JSON parse failed. Raw response: %s", text[:500])
        raise ValueError("Symbol selection model returned invalid JSON") from exc
    if not isinstance(data, dict):
        raise ValueError("Symbol selection response is not an object")
    symbols_raw = data.get("symbols")
    if not isinstance(symbols_raw, list):
        raise ValueError("Missing symbols array")

    symbols: list[str] = []
    for item in symbols_raw:
        symbol = normalize_psx_symbol(item)
        if symbol and symbol not in symbols:
            symbols.append(symbol)
        if len(symbols) == TOP_PICKS_COUNT:
            break

    if len(symbols) < TOP_PICKS_COUNT:
        raise ValueError(f"Model returned fewer than {TOP_PICKS_COUNT} valid symbols")
    return symbols


def collect_symbols_from_top_picks_result(result: dict[str, Any]) -> list[str]:
    """Collect unique symbols across daily, monthly, and yearly pick lists."""
    symbols: list[str] = []
    seen: set[str] = set()
    for key in ("daily_picks", "monthly_picks", "yearly_picks"):
        for pick in result.get(key, []):
            symbol = str(pick.get("symbol", "")).strip().upper()
            if symbol and symbol not in seen:
                seen.add(symbol)
                symbols.append(symbol)
    return symbols


def _parse_pick_price(value: str) -> float | None:
    """Parse a pick current_price string into a float, stripping PKR/commas."""
    cleaned = re.sub(r"[^\d.\-]", "", str(value or "").replace(",", ""))
    if not cleaned:
        return None
    try:
        parsed = float(cleaned)
    except ValueError:
        return None
    return parsed if parsed > 0 else None


def _expand_live_prices_for_result(
    result: dict[str, Any],
    live_prices: dict[str, float | None],
) -> dict[str, float | None]:
    """Merge live prices for all symbols appearing across pick horizons."""
    expanded = dict(live_prices)
    all_symbols = collect_symbols_from_top_picks_result(result)
    missing = [symbol for symbol in all_symbols if expanded.get(symbol) is None]
    if not missing:
        return expanded

    fetched = fetch_live_prices_for_symbols(missing)
    kse100_quotes = fetch_psx_kse100_quote_map()
    for symbol in missing:
        if fetched.get(symbol) is not None:
            expanded[symbol] = fetched[symbol]
            continue
        quote = kse100_quotes.get(symbol)
        if quote and quote.get("current", 0) > 0:
            expanded[symbol] = float(quote["current"])
    return expanded


def _enforce_live_prices_on_pick_list(
    picks: list[dict[str, str]],
    live_prices: dict[str, float | None],
) -> list[dict[str, str]]:
    """Overwrite AI prices with PSX live data; never keep hallucinated values."""
    enforced: list[dict[str, str]] = []
    for pick in picks:
        updated = dict(pick)
        symbol = str(pick.get("symbol", "")).strip().upper()
        live = live_prices.get(symbol)
        llm_price = _parse_pick_price(str(pick.get("current_price", "")))

        if live is not None and live > 0:
            if llm_price is not None and live > 0:
                pct_diff = abs(llm_price - live) / live * 100
                if pct_diff > 5:
                    logger.warning(
                        "LLM price hallucination for %s: llm=%s live=%.2f (diff=%.1f%%)",
                        symbol,
                        pick.get("current_price"),
                        live,
                        pct_diff,
                    )
            updated["current_price"] = f"{live:.2f}"
        else:
            updated["current_price"] = "N/A"
        enforced.append(updated)
    return enforced


def apply_live_prices_to_top_picks_result(
    result: dict[str, Any],
    live_prices: dict[str, float | None],
) -> dict[str, Any]:
    """Ensure structured top-picks cards use authoritative live prices, not AI guesses."""
    updated = dict(result)
    for key in ("daily_picks", "monthly_picks", "yearly_picks"):
        picks = updated.get(key)
        if isinstance(picks, list) and picks:
            updated[key] = _enforce_live_prices_on_pick_list(picks, live_prices)
    return updated


def _normalize_pick_item(item: dict[str, Any]) -> dict[str, str]:
    def _is_forbidden_target(value: str) -> bool:
        normalized = value.strip().lower()
        return normalized in {
            "",
            "n/a",
            "na",
            "unknown",
            "cannot be determined",
            "cannot determine",
            "not available",
        }

    buy_zone = str(item.get("buy_zone", "")).strip()
    exit_target = str(item.get("exit_target", "")).strip()
    if _is_forbidden_target(buy_zone):
        buy_zone = "Buy on 5% dip from latest market price"
    if _is_forbidden_target(exit_target):
        exit_target = "Target +12% from latest market price"

    return {
        "symbol": str(item.get("symbol", "")).strip().upper(),
        "sector": str(item.get("sector", "Unknown")).strip() or "Unknown",
        "summary": str(item.get("summary", "")).strip(),
        "why": str(item.get("why", "")).strip(),
        "outlook_short": str(item.get("outlook_short", "")).strip(),
        "outlook_long": str(item.get("outlook_long", "")).strip(),
        "buy_zone": buy_zone,
        "current_price": str(item.get("current_price", "N/A")).strip() or "N/A",
        "exit_target": exit_target,
    }


def _parse_pick_list(raw_list: Any) -> list[dict[str, str]]:
    if not isinstance(raw_list, list):
        return []
    picks: list[dict[str, str]] = []
    for item in raw_list[:TOP_PICKS_COUNT]:
        if isinstance(item, dict):
            picks.append(_normalize_pick_item(item))
    return picks


def _parse_top_picks_structured(raw: str) -> dict[str, Any]:
    text = _strip_markdown_fences(raw)
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("Response is not a JSON object")

    report_html = data.get("report_html", "").strip()
    daily_picks = _parse_pick_list(data.get("daily_picks", []))
    monthly_picks = _parse_pick_list(data.get("monthly_picks", []))
    yearly_picks = _parse_pick_list(data.get("yearly_picks", []))

    if not report_html:
        if not any([daily_picks, monthly_picks, yearly_picks]):
            raise ValueError("Missing report_html and pick arrays")
        report_html = _build_report_html_from_picks(
            report_date="",
            daily_picks=daily_picks,
            monthly_picks=monthly_picks,
            yearly_picks=yearly_picks,
        )

    return {
        "report_html": _wrap_html_document(report_html),
        "daily_picks": daily_picks,
        "monthly_picks": monthly_picks,
        "yearly_picks": yearly_picks,
    }


def _parse_top_picks_picks_only(raw: str) -> dict[str, list[dict[str, str]]]:
    text = _strip_markdown_fences(raw)
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("Response is not a JSON object")
    return {
        "daily_picks": _parse_pick_list(data.get("daily_picks", [])),
        "monthly_picks": _parse_pick_list(data.get("monthly_picks", [])),
        "yearly_picks": _parse_pick_list(data.get("yearly_picks", [])),
    }


def _build_report_html_from_picks(
    *,
    report_date: str,
    daily_picks: list[dict[str, str]],
    monthly_picks: list[dict[str, str]],
    yearly_picks: list[dict[str, str]],
) -> str:
    def _table(title: str, picks: list[dict[str, str]]) -> str:
        rows = ""
        for pick in picks:
            rows += (
                "<tr>"
                f"<td>{escape(pick.get('symbol', ''))}</td>"
                f"<td>{escape(pick.get('summary', ''))}</td>"
                f"<td>{escape(pick.get('current_price', 'N/A'))}</td>"
                f"<td>{escape(pick.get('buy_zone', ''))}</td>"
                f"<td>{escape(pick.get('exit_target', ''))}</td>"
                "</tr>"
            )
        if not rows:
            rows = "<tr><td colspan='5'>No picks available.</td></tr>"
        return (
            f"<h2>{escape(title)}</h2>"
            "<table border='1' cellpadding='6' cellspacing='0' style='width:100%;border-collapse:collapse;'>"
            "<tr><th>Ticker</th><th>Thesis</th><th>Current Price</th><th>Buy Zone</th><th>Exit Target</th></tr>"
            f"{rows}</table>"
        )

    title = (
        f"PSX Top {TOP_PICKS_COUNT} Picks — {escape(report_date)}"
        if report_date
        else f"PSX Top {TOP_PICKS_COUNT} Picks"
    )
    body = (
        f"<h1 style='color:#111827;'>{title}</h1>"
        + _table(f"Daily Top {TOP_PICKS_COUNT} Picks", daily_picks)
        + _table(f"Monthly Top {TOP_PICKS_COUNT} Picks", monthly_picks)
        + _table(f"Yearly Top {TOP_PICKS_COUNT} Picks", yearly_picks)
    )
    return _wrap_html_document(body)


def generate_top_picks_structured(
    groq_api_key: str,
    model_name: str,
    report_date: str,
    news: list[dict[str, str]],
    news_text: str,
    gemini_api_key: str | None = None,
) -> dict[str, Any]:
    """Generate top picks HTML plus structured daily/monthly/yearly pick cards."""
    user_prompt = f"""Generate today's PSX Top 5 Picks report.

Report Date (PKT): {report_date}

=== NEWS HEADLINES ===
{news_text}

Return a JSON object with:
1. "report_html" — full HTML with Daily, Monthly, and Yearly Top 5 table sections
2. "daily_picks" — array of exactly 5 objects for short-term trades
3. "monthly_picks" — array of exactly 5 objects for monthly horizon
4. "yearly_picks" — array of exactly 5 objects for long-term horizon

Each pick object must include:
symbol, sector, summary, why, outlook_short, outlook_long, buy_zone, current_price, exit_target

Base picks on news headlines and PSX market trends. Label as AI suggestions, not fatwas.
STRICT PRICE RULE:
- DO NOT hallucinate or guess current stock prices.
- If a symbol is not in provided live/portfolio data, set current_price to "Check Market".
- For such symbols, use percentage-style buy/exit targets (e.g., "Buy on 5% dip", "Target +15%")."""

    try:
        raw = _call_llm_json(
            groq_api_key=groq_api_key,
            gemini_api_key=gemini_api_key,
            model_name=model_name,
            system_prompt=TOP_PICKS_STRUCTURED_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.4,
            max_tokens=16384,
        )
        return _parse_top_picks_structured(raw)
    except Exception as exc:
        logger.exception("All LLM providers failed for structured top picks: %s", exc)

    logger.warning("Using fallback top picks template.")
    return {
        "report_html": _build_fallback_top_picks_html(report_date, news),
        "daily_picks": [],
        "monthly_picks": [],
        "yearly_picks": [],
    }


def select_top_pick_symbols(
    groq_api_key: str,
    model_name: str,
    report_date: str,
    news_text: str,
    gemini_api_key: str | None = None,
) -> list[str]:
    """Select top pick symbols from news context."""
    user_prompt = f"""Select exactly {TOP_PICKS_COUNT} PSX ticker symbols for top picks.

Report Date (PKT): {report_date}

=== NEWS HEADLINES ===
{news_text}

Return JSON only:
{{"symbols": ["EFERT", "MARI", "SYS", "MEBL", "HUBC", "OGDC"]}}"""

    try:
        raw_text = _call_llm_json(
            groq_api_key=groq_api_key,
            gemini_api_key=gemini_api_key,
            model_name=model_name,
            system_prompt=TOP_PICK_SYMBOL_SELECTION_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.2,
            max_tokens=2048,
        )
        return _parse_top_pick_symbols_json(raw_text)
    except Exception as exc:
        logger.exception("Symbol selection failed across all LLM providers: %s", exc)
        raise RuntimeError("Failed to select top pick symbols from AI model.") from exc


def generate_top_picks_with_live_prices(
    groq_api_key: str,
    model_name: str,
    report_date: str,
    news: list[dict[str, str]],
    news_text: str,
    recommended_symbols: list[str],
    live_prices: dict[str, float | None],
    gemini_api_key: str | None = None,
) -> dict[str, Any]:
    """Generate final top picks report from selected symbols and exact fetched prices."""
    live_prices_data = {
        symbol: (
            f"{live_prices[symbol]:.2f}"
            if live_prices.get(symbol) is not None and live_prices[symbol] > 0
            else "N/A"
        )
        for symbol in recommended_symbols
    }
    live_prices_json = json.dumps(live_prices_data, indent=2)
    symbols_list = ", ".join(recommended_symbols)

    user_prompt = f"""Generate PSX Top {TOP_PICKS_COUNT} Picks for three horizons using ONLY these symbols and live prices.

Report Date (PKT): {report_date}
Symbols: {symbols_list}
LIVE_PRICES_DATA:
{live_prices_json}

News (context):
{news_text[:2000]}

Return JSON with daily_picks, monthly_picks, yearly_picks ({TOP_PICKS_COUNT} objects each).
Use LIVE_PRICES_DATA exactly for current_price."""

    try:
        raw = _call_llm_json(
            groq_api_key=groq_api_key,
            gemini_api_key=gemini_api_key,
            model_name=model_name,
            system_prompt=TOP_PICKS_WITH_LIVE_PRICES_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.3,
            max_tokens=TOP_PICKS_CRON_MAX_TOKENS,
        )
        parsed_picks = _parse_top_picks_picks_only(raw)
        report_html = _build_report_html_from_picks(
            report_date=report_date,
            daily_picks=parsed_picks["daily_picks"],
            monthly_picks=parsed_picks["monthly_picks"],
            yearly_picks=parsed_picks["yearly_picks"],
        )
        parsed = {
            "report_html": report_html,
            **parsed_picks,
        }
        expanded_prices = _expand_live_prices_for_result(parsed, live_prices)
        return apply_live_prices_to_top_picks_result(parsed, expanded_prices)
    except Exception as exc:
        logger.exception(
            "All LLM providers failed for top picks with live prices: %s",
            exc,
        )

    logger.warning("Using fallback top picks template.")
    return {
        "report_html": _build_fallback_top_picks_html(report_date, news),
        "daily_picks": [],
        "monthly_picks": [],
        "yearly_picks": [],
    }


def _sector_timeframe_label(timeframe: str) -> str:
    return TIMEFRAME_PICK_LABELS.get(timeframe.strip().lower(), "Daily")


def _build_sector_symbol_system_prompt(sector: str, timeframe: str) -> str:
    label = _sector_timeframe_label(timeframe)
    return f"""You are a PSX equity research analyst.

Task:
- Select exactly 2 to {SECTOR_PICKS_COUNT} PSX ticker symbols strictly from the "{sector}" sector.
- Symbols must be suitable for a {label} ({timeframe}) investment horizon.

Output rules:
- Output ONLY a JSON object with key "symbols".
- "symbols" must be an array of 2 to {SECTOR_PICKS_COUNT} uppercase PSX tickers from "{sector}" only.
- Do not include explanations, markdown, or code fences."""


def _parse_sector_symbols_json(raw: str) -> list[str]:
    text = _strip_markdown_fences(raw)
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("Sector symbol response is not an object")
    symbols_raw = data.get("symbols")
    if not isinstance(symbols_raw, list):
        raise ValueError("Missing symbols array")

    symbols: list[str] = []
    for item in symbols_raw:
        symbol = normalize_psx_symbol(item)
        if symbol and symbol not in symbols:
            symbols.append(symbol)
        if len(symbols) == SECTOR_PICKS_COUNT:
            break

    if len(symbols) < 2:
        raise ValueError(f"Model returned fewer than 2 valid sector symbols")
    return symbols


def select_sector_pick_symbols(
    *,
    groq_api_key: str,
    model_name: str,
    report_date: str,
    sector: str,
    timeframe: str,
    news_text: str,
    gemini_api_key: str | None = None,
) -> list[str]:
    """Select 2-3 PSX symbols for a specific sector and investment horizon."""
    label = _sector_timeframe_label(timeframe)
    user_prompt = f"""Select 2 to {SECTOR_PICKS_COUNT} PSX ticker symbols for sector-specific top picks.

Report Date (PKT): {report_date}
Sector: {sector}
Investment Horizon: {timeframe} ({label})

=== NEWS HEADLINES ===
{news_text[:2500]}

Return JSON only:
{{"symbols": ["SYMBOL1", "SYMBOL2"]}}

Rules:
- Every symbol MUST belong to the "{sector}" sector on PSX.
- Pick symbols suited to {label} trading/investing (e.g., Daily = swing trade setup, Yearly = dividend/growth)."""

    try:
        raw_text = _call_llm_json(
            groq_api_key=groq_api_key,
            gemini_api_key=gemini_api_key,
            model_name=model_name,
            system_prompt=_build_sector_symbol_system_prompt(sector, timeframe),
            user_prompt=user_prompt,
            temperature=0.2,
            max_tokens=1024,
        )
        return _parse_sector_symbols_json(raw_text)
    except Exception as exc:
        logger.exception(
            "Sector symbol selection failed for %s/%s: %s", sector, timeframe, exc
        )
        fallback = SECTOR_FALLBACK_SYMBOLS.get(sector, [])
        if len(fallback) >= 2:
            logger.warning("Using fallback symbols for %s: %s", sector, fallback)
            return fallback[:SECTOR_PICKS_COUNT]
        raise RuntimeError(
            f"Failed to select sector pick symbols for {sector}/{timeframe}."
        ) from exc


def _build_sector_picks_system_prompt(sector: str, timeframe: str) -> str:
    label = _sector_timeframe_label(timeframe)
    return f"""You are a PSX equity research analyst producing Shariah-compliant stock picks.

You are generating stock picks strictly for the "{sector}" sector on a "{timeframe}" ({label}) investment horizon.
Pick the top 2 to {SECTOR_PICKS_COUNT} best Shariah-compliant stocks in this specific sector.

Rules:
- Each pick's thesis (summary/why) MUST explain WHY the stock fits this {label} horizon
  (Daily = swing trade setup, Monthly = medium-term catalyst, Yearly = long-term dividend/growth).
- Output ONLY a valid JSON object with key "picks".
- "picks" must contain 2 to {SECTOR_PICKS_COUNT} objects.
- CRITICAL: Use exact LIVE_PRICES_DATA values for current_price. Never invent prices.
- If LIVE_PRICES_DATA shows "N/A", set current_price to "N/A" and use percentage buy/exit targets.
- Each pick object: symbol, sector, summary, why, outlook_short, outlook_long, buy_zone, current_price, exit_target.
- Set sector to "{sector}" for every pick.
- Professional tone; AI investment suggestions only (not fatwas)."""


def _parse_sector_pick_list(raw_list: Any) -> list[dict[str, str]]:
    if not isinstance(raw_list, list):
        return []
    picks: list[dict[str, str]] = []
    for item in raw_list[:SECTOR_PICKS_COUNT]:
        if isinstance(item, dict):
            picks.append(_normalize_pick_item(item))
    return picks


def _parse_sector_picks_json(raw: str) -> list[dict[str, str]]:
    text = _strip_markdown_fences(raw)
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("Sector picks response is not an object")
    picks = _parse_sector_pick_list(data.get("picks", []))
    if len(picks) < 1:
        raise ValueError("Missing picks array")
    return picks


def _build_sector_picks_html(
    *,
    report_date: str,
    sector: str,
    timeframe: str,
    picks: list[dict[str, str]],
) -> str:
    label = _sector_timeframe_label(timeframe)
    rows = ""
    for pick in picks:
        rows += (
            "<tr>"
            f"<td>{escape(pick.get('symbol', ''))}</td>"
            f"<td>{escape(pick.get('summary', ''))}</td>"
            f"<td>{escape(pick.get('current_price', 'N/A'))}</td>"
            f"<td>{escape(pick.get('buy_zone', ''))}</td>"
            f"<td>{escape(pick.get('exit_target', ''))}</td>"
            "</tr>"
        )
    if not rows:
        rows = "<tr><td colspan='5'>No picks available.</td></tr>"
    body = (
        f"<h1 style='color:#111827;'>PSX {escape(sector)} Picks — {escape(label)}</h1>"
        f"<p style='color:#64748b;'>Report Date: {escape(report_date)} | Horizon: {escape(timeframe)}</p>"
        f"<h2>{escape(label)} Top Picks — {escape(sector)}</h2>"
        "<table border='1' cellpadding='6' cellspacing='0' style='width:100%;border-collapse:collapse;'>"
        "<tr><th>Ticker</th><th>Thesis</th><th>Current Price</th><th>Buy Zone</th><th>Exit Target</th></tr>"
        f"{rows}</table>"
    )
    return _wrap_html_document(body)


def apply_live_prices_to_sector_picks(
    result: dict[str, Any],
    live_prices: dict[str, float | None],
) -> dict[str, Any]:
    """Ensure sector pick cards use authoritative live prices."""
    updated = dict(result)
    picks = updated.get("picks")
    if not isinstance(picks, list) or not picks:
        return updated

    expanded = dict(live_prices)
    missing = [
        str(pick.get("symbol", "")).strip().upper()
        for pick in picks
        if expanded.get(str(pick.get("symbol", "")).strip().upper()) is None
    ]
    missing = [symbol for symbol in missing if symbol]
    if missing:
        fetched = fetch_live_prices_for_symbols(missing)
        kse100_quotes = fetch_psx_kse100_quote_map()
        for symbol in missing:
            if fetched.get(symbol) is not None:
                expanded[symbol] = fetched[symbol]
                continue
            quote = kse100_quotes.get(symbol)
            if quote and quote.get("current", 0) > 0:
                expanded[symbol] = float(quote["current"])

    updated["picks"] = _enforce_live_prices_on_pick_list(picks, expanded)
    return updated


def generate_sector_picks_with_live_prices(
    *,
    groq_api_key: str,
    model_name: str,
    report_date: str,
    sector: str,
    timeframe: str,
    news: list[dict[str, str]],
    news_text: str,
    recommended_symbols: list[str],
    live_prices: dict[str, float | None],
    gemini_api_key: str | None = None,
) -> dict[str, Any]:
    """Generate sector/timeframe-specific picks from selected symbols and live prices."""
    label = _sector_timeframe_label(timeframe)
    live_prices_data = {
        symbol: (
            f"{live_prices[symbol]:.2f}"
            if live_prices.get(symbol) is not None and live_prices[symbol] > 0
            else "N/A"
        )
        for symbol in recommended_symbols
    }
    live_prices_json = json.dumps(live_prices_data, indent=2)
    symbols_list = ", ".join(recommended_symbols)

    user_prompt = f"""Generate PSX top picks for one sector and horizon.

Report Date (PKT): {report_date}
Sector: {sector}
Investment Horizon: {timeframe} ({label})
Symbols (use ONLY these): {symbols_list}

LIVE_PRICES_DATA:
{live_prices_json}

News (context):
{news_text[:2000]}

Return JSON with key "picks" containing 2 to {SECTOR_PICKS_COUNT} objects.
Each thesis must explain why the stock fits {label} horizon:
- Daily = swing trade setup
- Monthly = medium-term catalyst
- Yearly = long-term dividend/growth

Use LIVE_PRICES_DATA exactly for current_price."""

    try:
        raw = _call_llm_json(
            groq_api_key=groq_api_key,
            gemini_api_key=gemini_api_key,
            model_name=model_name,
            system_prompt=_build_sector_picks_system_prompt(sector, timeframe),
            user_prompt=user_prompt,
            temperature=0.3,
            max_tokens=TOP_PICKS_CRON_MAX_TOKENS,
        )
        picks = _parse_sector_picks_json(raw)
        for pick in picks:
            pick["sector"] = sector
        report_html = _build_sector_picks_html(
            report_date=report_date,
            sector=sector,
            timeframe=timeframe,
            picks=picks,
        )
        parsed = {"picks": picks, "report_html": report_html}
        return apply_live_prices_to_sector_picks(parsed, live_prices)
    except Exception as exc:
        logger.exception(
            "Sector picks generation failed for %s/%s: %s", sector, timeframe, exc
        )

    logger.warning("Using empty fallback for sector picks %s/%s.", sector, timeframe)
    return {"picks": [], "report_html": ""}


def generate_single_stock_deep_dive(
    *,
    groq_api_key: str,
    model_name: str,
    report_date: str,
    symbol: str,
    current_price: float | None,
    rsi: float | None,
    support_1: float | None,
    resistance_1: float | None,
    news_text: str,
    gemini_api_key: str | None = None,
    timeframe: str = "1d",
) -> dict[str, str]:
    """Generate a strict JSON deep-dive for one stock using provided live data."""
    if current_price is None:
        raise ValueError(f"Unable to fetch live current price for symbol: {symbol}")

    timeframe_label = TIMEFRAME_LABELS.get(timeframe, "Daily")
    fallback_target = resistance_1 if resistance_1 is not None else current_price * 1.08
    fallback_action = "HOLD"
    if resistance_1 is not None and current_price < resistance_1 * 0.95:
        fallback_action = "BUY"
    if support_1 is not None and current_price < support_1:
        fallback_action = "SELL"

    fallback = {
        "symbol": symbol,
        "current_price": f"{current_price:.2f}",
        "target_price": f"{fallback_target:.2f}",
        "weightage_recommendation": "5% - 10%",
        "future_outlook": (
            "Momentum and risk should be monitored against current PSX volatility and "
            "company-specific disclosures. The stock remains sensitive to market sentiment, "
            "so position sizing discipline is important."
        ),
        "action": fallback_action,
    }

    user_prompt = f"""Prepare a Single Stock Deep Dive JSON.

Report Date (PKT): {report_date}
Chart Interval: {timeframe} ({timeframe_label})

=== STOCK ===
Symbol: {symbol}
Current Price (LIVE, EXACT): {current_price:.2f}
RSI: {"N/A" if rsi is None else f"{rsi:.2f}"}
Support 1 (S1): {"N/A" if support_1 is None else f"{support_1:.2f}"}
Resistance 1 (R1): {"N/A" if resistance_1 is None else f"{resistance_1:.2f}"}

=== NEWS HEADLINES ===
{news_text}

Requirements:
- You are analyzing on a [{timeframe}] chart interval. Adjust strategy accordingly ('1W' = swing trading, '1M' = long-term investing).
- Keep current_price exactly as provided live value.
- target_price should be a short-term exit/profit target based primarily on R1.
- weightage_recommendation must be suitable for risk/volatility on this timeframe.
- future_outlook must be 2-3 sentences referencing the {timeframe_label} chart context.
- action must be one of: STRONG BUY, BUY, HOLD, SELL."""

    try:
        raw = _call_llm_json(
            groq_api_key=groq_api_key,
            gemini_api_key=gemini_api_key,
            model_name=model_name,
            system_prompt=SINGLE_STOCK_DEEP_DIVE_SYSTEM_PROMPT.format(timeframe=timeframe),
            user_prompt=user_prompt,
            temperature=0.25,
            max_tokens=2048,
        )
        parsed = json.loads(_strip_markdown_fences(raw))
        if not isinstance(parsed, dict):
            raise ValueError("Single stock response is not a JSON object")

        action = str(parsed.get("action", "")).strip().upper()
        if action not in {"STRONG BUY", "BUY", "HOLD", "SELL"}:
            action = fallback["action"]

        return {
            "symbol": str(parsed.get("symbol", symbol)).strip().upper() or symbol,
            "current_price": f"{current_price:.2f}",
            "target_price": str(parsed.get("target_price", fallback["target_price"])).strip()
            or fallback["target_price"],
            "weightage_recommendation": str(
                parsed.get(
                    "weightage_recommendation",
                    fallback["weightage_recommendation"],
                )
            ).strip()
            or fallback["weightage_recommendation"],
            "future_outlook": str(parsed.get("future_outlook", fallback["future_outlook"])).strip()
            or fallback["future_outlook"],
            "action": action,
        }
    except Exception as exc:
        logger.exception("All LLM providers failed for single-stock deep dive: %s", exc)

    logger.warning("Using fallback single-stock deep dive for %s.", symbol)
    return fallback
