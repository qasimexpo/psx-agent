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

Important rules:
- Open the html_email with a warm personalized greeting: "Assalamu Alaikum {client_name}, here is your specific portfolio review..."
- Analyze ONLY this client's holdings and totals — do not reference other clients or portfolios.
- Use the exact Qty, P/L (PKR), P/E, EPS, and holding period values provided — do not recalculate them differently.
- Compare each holding's current price vs buy price and support/resistance (R1/S1) when choosing Action and Target Exit Price.
- If any sector exceeds 40% of this client's portfolio value, display a prominent "⚠️ RISK WARNING" banner at the top of the HTML report.
- When recommending Top 5 Shariah-Compliant Picks, base suggestions on provided news/trends. Clearly label these as AI investment suggestions, NOT religious rulings or fatwas.
- Write in a professional, institutional tone — like a CRO briefing the client directly.
- Output ONLY a valid JSON object with exactly two keys: "html_email" and "telegram_summary".
- The html_email value must be clean HTML suitable for an email body with inline CSS only.
- The telegram_summary value must be short Markdown with emojis, address {client_name} by name, suitable for Telegram parse_mode=Markdown.
- Do NOT include markdown code fences, <script> tags, or external CSS/JS links in html_email.

The html_email MUST include these sections with clear headings:

0. Portfolio Summary — at the very top (after greeting), show:
   - Total Portfolio Value (PKR)
   - Total Unrealized P/L (PKR)
   - Sector allocation table or list with percentages
   - If any sector > 40%, a prominent "⚠️ RISK WARNING" banner

1. Portfolio Action Plan — HTML table with EXACTLY these columns in order:
   Symbol | Current Price | P/L (PKR) | Action | Qty to Sell | Target Buy Zone | Exit Target
   - Current Price: use provided live market data only (no invented values).
   - Action MUST be exactly one of: Buy More, Hold, Sell Partial, Sell All.
   - Qty to Sell: only populate for Sell Partial (e.g. "Sell 50%"), otherwise "-".
   - Target Buy Zone: only populate for Buy More (specific numeric price range), otherwise "-".
   - Exit Target: provide an exact numeric target for taking profit/cutting loss.
   - Include EVERY symbol from technical data — do not skip any row.

2. Top 5 Shariah-Compliant Picks — HTML table with columns:
   Ticker | Thesis | Current Price | Suggested Buy Price | Exit Target | Risk Note
   - STRICT PRICE RULE: DO NOT hallucinate or guess current stock prices.
   - If a recommended stock is NOT in provided portfolio/live data, write "Check Market" in Current Price.
   - For non-portfolio picks, write Buy/Exit targets as percentages (e.g. "Buy on 5% dip", "Target +15%"), not fake numeric prices.

3. Dividends & Board Meetings — display the scraped PSX data provided (or state if unavailable)

4. News Summary — a concise 2-3 sentence synthesis of the headlines

The telegram_summary MUST include:
- Greeting addressing {client_name} and report date with total portfolio P/L (with emoji)
- Any critical sector RISK WARNING if >40%
- Top 2-3 immediate actionable alerts (stop loss, take profit, exit signals)
- Keep under 3500 characters; use Telegram Markdown (*bold*, _italic_)
"""


def _build_system_prompt(client_name: str) -> str:
    return SYSTEM_PROMPT_TEMPLATE.format(client_name=client_name)


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
) -> dict[str, str]:
    """Build HTML email and Telegram summary when Gemini is unavailable."""
    portfolio_events = psx_events.get("portfolio_events", {})
    table_rows = ""

    for row in technical_rows:
        symbol = row["symbol"]
        pl_pkr = _format_pkr(row.get("pl_amount"))
        upcoming = portfolio_events.get(symbol, "-")
        exit_price = _fallback_exit_price(row)
        action = fallback_action(row)

        table_rows += f"""
        <tr>
            <td style="padding:8px;border:1px solid #e5e7eb;"><strong>{escape(symbol)}</strong></td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">{escape(str(row.get('quantity', 'N/A')))}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">{escape(str(row.get('buy_price', 'N/A')))}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">{escape(str(row.get('current_price', 'N/A')))}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">{escape(pl_pkr)}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">{escape(_format_pe_eps_col(row))}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">{escape(_format_holding_col(row))}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">{escape(action)}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">{escape(exit_price)}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">{escape(upcoming)}</td>
        </tr>"""

    news_items = ""
    for item in news:
        news_items += f"<li>{escape(item['title'])}</li>"
    if not news_items:
        news_items = "<li>No headlines available.</li>"

    summary_html = _build_sector_summary_html(portfolio_summary)

    body = f"""
    <h1 style="color:#111827;">PSX AI Risk Brief — {escape(client_name)}</h1>
    <p style="font-size:15px;margin-bottom:16px;">
        Assalamu Alaikum <strong>{escape(client_name)}</strong>, here is your specific portfolio review for {escape(report_date)}.
    </p>
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
                <th style="padding:8px;border:1px solid #e5e7eb;">Qty</th>
                <th style="padding:8px;border:1px solid #e5e7eb;">Buy Price</th>
                <th style="padding:8px;border:1px solid #e5e7eb;">Current Price</th>
                <th style="padding:8px;border:1px solid #e5e7eb;">P/L (PKR)</th>
                <th style="padding:8px;border:1px solid #e5e7eb;">P/E Ratio &amp; EPS</th>
                <th style="padding:8px;border:1px solid #e5e7eb;">Holding Period</th>
                <th style="padding:8px;border:1px solid #e5e7eb;">Action</th>
                <th style="padding:8px;border:1px solid #e5e7eb;">Target Exit Price</th>
                <th style="padding:8px;border:1px solid #e5e7eb;">Upcoming Events</th>
            </tr>
        </thead>
        <tbody>{table_rows}</tbody>
    </table>

    <h2>Top 5 Shariah-Compliant Picks</h2>
    <p>AI recommendations unavailable in fallback mode.</p>

    <h2>Dividends &amp; Board Meetings</h2>
    <pre style="background:#f9fafb;padding:12px;font-size:13px;white-space:pre-wrap;">{escape(psx_events.get('payouts_text', 'No data'))}</pre>
    <pre style="background:#f9fafb;padding:12px;font-size:13px;white-space:pre-wrap;">{escape(psx_events.get('board_meetings_text', 'No data'))}</pre>

    <h2>News Summary</h2>
    <ul>{news_items}</ul>
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
) -> dict[str, str]:
    """
    Generate HTML email and Telegram summary using Gemini.

    Falls back to rule-based templates if the AI call fails.
    """
    user_prompt = f"""Generate today's PSX institutional risk briefing for client: {client_name}.

Report Date (PKT): {report_date}
Client Name: {client_name}

=== PORTFOLIO SUMMARY (use these totals exactly) ===
{portfolio_summary_text}

=== TECHNICAL & FUNDAMENTAL DATA (use Qty, P/L PKR, P/E, EPS, Holding Period exactly) ===
{technical_text}

=== PORTFOLIO UPCOMING EVENTS (Upcoming Events column) ===
{psx_events.get('portfolio_events_text', 'No events in +/-15 day window.')}

=== NEWS HEADLINES ===
{news_text}

=== PSX PAYOUTS / DIVIDENDS ===
{psx_events.get('payouts_text', 'No payout data available.')}

=== PSX BOARD MEETINGS / ANNOUNCEMENTS ===
{psx_events.get('board_meetings_text', 'No board meeting data available.')}

Return ONLY a JSON object with two keys:
1. "html_email" — full HTML report with inline CSS and all required sections
2. "telegram_summary" — short emoji-rich Markdown for Telegram

Rules:
- Greet {client_name} by name at the start of html_email.
- Analyze ONLY this client's portfolio — not any other client.
- Portfolio Action Plan must use exactly 7 columns in this order:
  Symbol | Current Price | P/L (PKR) | Action | Qty to Sell | Target Buy Zone | Exit Target.
- Action must be one of: Buy More, Hold, Sell Partial, Sell All.
- Qty to Sell only for Sell Partial; otherwise "-".
- Target Buy Zone only for Buy More; otherwise "-".
- Use provided totals, Qty, P/L (PKR), P/E, EPS, and Holding Period verbatim.
- Show ⚠️ RISK WARNING banner if any sector exceeds 40%.
- Current Price must use provided live data only (never invent values).
- For Top 5 picks: never hallucinate current price. If not in provided live data, write "Check Market".
- For such non-portfolio picks, Buy/Exit targets must be percentage-based (e.g., "Buy on 5% dip", "Target +15%").
- telegram_summary: address {client_name}, total P/L, risk warnings, top 2-3 actionable alerts."""

    system_prompt = _build_system_prompt(client_name)

    try:
        raw = _call_llm_json(
            groq_api_key=groq_api_key,
            gemini_api_key=gemini_api_key,
            model_name=model_name,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.4,
            max_tokens=16384,
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


TOP_PICK_SYMBOL_SELECTION_SYSTEM_PROMPT = """You are a PSX equity research analyst.

Task:
- Analyze provided PSX news headlines and return ONLY 5 PSX ticker symbols as JSON.

Output rules:
- Output ONLY a JSON object with key "symbols".
- "symbols" must be an array of exactly 5 uppercase PSX tickers.
- Do not include explanations, markdown, or code fences.
"""


TOP_PICKS_WITH_LIVE_PRICES_SYSTEM_PROMPT = """You are a PSX equity research analyst producing Shariah-compliant stock picks for the Pakistan Stock Exchange.

Rules:
- Output ONLY a valid JSON object with keys: "report_html", "daily_picks", "monthly_picks", "yearly_picks".
- daily_picks, monthly_picks, and yearly_picks must each contain exactly 5 objects using ONLY the 5 provided symbols (reorder per horizon is fine; no extra tickers).
- CRITICAL: You MUST use the exact numerical values provided in the LIVE_PRICES_DATA dictionary for the current_price field.
- DO NOT use your internal knowledge or historical data for prices.
- If a symbol is in LIVE_PRICES_DATA, use that exact price for current_price.
- If a symbol's price is missing or "N/A" in LIVE_PRICES_DATA, you MUST output "N/A" for current_price.
- Under NO circumstances should you invent or estimate a current price.
- For each pick, Target Buy Zone and Exit Target must be numeric PKR values derived from the provided current price when available.
- You MUST NEVER write "Cannot be determined", "Unknown", or similar non-actionable placeholders for buy_zone or exit_target.
- When current_price is "N/A", use percentage-style buy/exit targets (e.g., "Buy on 5% dip", "Target +12%").
- report_html must include Daily, Monthly, and Yearly Top 5 sections as HTML tables.
- Use professional institutional tone and clearly label as AI suggestions (not fatwas).
"""


SINGLE_STOCK_DEEP_DIVE_SYSTEM_PROMPT = """You are a PSX single-stock analyst producing a concise institutional deep-dive.

Rules:
- Output ONLY valid JSON with keys:
  "symbol", "current_price", "target_price", "weightage_recommendation", "future_outlook", "action".
- Use the provided live market data exactly for current_price.
- NEVER hallucinate or guess prices.
- target_price must be derived from provided Resistance 1 and risk context.
- weightage_recommendation must be a percentage string (example: "8% - 12%").
- future_outlook must be 2-3 sentences grounded in provided PSX context/news.
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
        if len(symbols) == 5:
            break

    if len(symbols) < 5:
        raise ValueError("Model returned fewer than 5 valid symbols")
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
    for item in raw_list[:5]:
        if isinstance(item, dict):
            picks.append(_normalize_pick_item(item))
    return picks


def _parse_top_picks_structured(raw: str) -> dict[str, Any]:
    text = _strip_markdown_fences(raw)
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("Response is not a JSON object")

    report_html = data.get("report_html", "").strip()
    if not report_html:
        raise ValueError("Missing report_html key")

    return {
        "report_html": _wrap_html_document(report_html),
        "daily_picks": _parse_pick_list(data.get("daily_picks", [])),
        "monthly_picks": _parse_pick_list(data.get("monthly_picks", [])),
        "yearly_picks": _parse_pick_list(data.get("yearly_picks", [])),
    }


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
    """Select top 5 symbols from news context."""
    user_prompt = f"""Select exactly 5 PSX ticker symbols for top picks.

Report Date (PKT): {report_date}

=== NEWS HEADLINES ===
{news_text}

Return JSON only:
{{"symbols": ["EFERT", "MARI", "SYS", "MEBL", "HUBC"]}}"""

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

    user_prompt = f"""Generate today's PSX Top 5 Picks report from provided symbols and exact live prices.

Report Date (PKT): {report_date}

=== NEWS HEADLINES ===
{news_text}

=== PROVIDED SYMBOLS (use ONLY these 5 in every horizon) ===
{symbols_list}

=== LIVE_PRICES_DATA (authoritative) ===
{live_prices_json}

Return a JSON object with:
1. "report_html" — full HTML with Daily, Monthly, and Yearly Top 5 table sections
2. "daily_picks" — array of exactly 5 objects (ONLY the 5 provided symbols)
3. "monthly_picks" — array of exactly 5 objects (ONLY the 5 provided symbols)
4. "yearly_picks" — array of exactly 5 objects (ONLY the 5 provided symbols)

Each pick object must include:
symbol, sector, summary, why, outlook_short, outlook_long, buy_zone, current_price, exit_target

CRITICAL PRICE RULES:
- Use LIVE_PRICES_DATA values exactly for current_price.
- DO NOT use internal knowledge or historical prices.
- If LIVE_PRICES_DATA shows "N/A" for a symbol, set current_price to "N/A".
- Never invent or estimate a current price.

Mandatory output rules:
- Never write "Cannot be determined" for buy_zone or exit_target.
- When current_price is "N/A", use percentage-style buy/exit targets.
- Keep targets clear and actionable."""

    try:
        raw = _call_llm_json(
            groq_api_key=groq_api_key,
            gemini_api_key=gemini_api_key,
            model_name=model_name,
            system_prompt=TOP_PICKS_WITH_LIVE_PRICES_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.3,
            max_tokens=16384,
        )
        parsed = _parse_top_picks_structured(raw)
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
) -> dict[str, str]:
    """Generate a strict JSON deep-dive for one stock using provided live data."""
    if current_price is None:
        raise ValueError(f"Unable to fetch live current price for symbol: {symbol}")

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

=== STOCK ===
Symbol: {symbol}
Current Price (LIVE, EXACT): {current_price:.2f}
RSI: {"N/A" if rsi is None else f"{rsi:.2f}"}
Support 1 (S1): {"N/A" if support_1 is None else f"{support_1:.2f}"}
Resistance 1 (R1): {"N/A" if resistance_1 is None else f"{resistance_1:.2f}"}

=== NEWS HEADLINES ===
{news_text}

Requirements:
- Keep current_price exactly as provided live value.
- target_price should be a short-term exit/profit target based primarily on R1.
- weightage_recommendation must be suitable for risk/volatility.
- future_outlook must be 2-3 sentences.
- action must be one of: STRONG BUY, BUY, HOLD, SELL."""

    try:
        raw = _call_llm_json(
            groq_api_key=groq_api_key,
            gemini_api_key=gemini_api_key,
            model_name=model_name,
            system_prompt=SINGLE_STOCK_DEEP_DIVE_SYSTEM_PROMPT,
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
