"""
Gemini AI agent for generating PSX portfolio HTML reports and Telegram summaries.
"""

import json
import re
import sys
from html import escape
from typing import Any

import google.generativeai as genai

from fetchers import _format_pkr

FALLBACK_MODELS = ("gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash")

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
   Symbol | Qty | Buy Price | Current Price | P/L (PKR) | P/E Ratio & EPS | Holding Period | Action | Target Exit Price | Upcoming Events
   - P/E Ratio & EPS: combine as "12.08 / EPS 14.71" or "N/A"
   - Holding Period: e.g. "412 days — Long-Term (>1 Yr)" or "N/A"
   - Action: Hold, Buy More, Sell 50%, Exit, Monitor, etc.
   - Target Exit Price: specific numeric price using R1/S1 (e.g. "Sell at 245.00", "Cut loss below 216.00")
   - Upcoming Events: from portfolio_events_text; use "-" if none
   - Include EVERY symbol from the technical data — do not skip any row.

2. Top 5 Shariah-Compliant Picks — HTML table with columns:
   Ticker | Thesis | Suggested Buy Price | Risk Note

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
    api_key: str,
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
- Portfolio Action Plan must have all 10 columns and every portfolio symbol.
- Use provided totals, Qty, P/L (PKR), P/E, EPS, and Holding Period verbatim.
- Show ⚠️ RISK WARNING banner if any sector exceeds 40%.
- Target Exit Price must reference R1/S1 from the technical data.
- telegram_summary: address {client_name}, total P/L, risk warnings, top 2-3 actionable alerts."""

    system_prompt = _build_system_prompt(client_name)

    models_to_try = [model_name, *FALLBACK_MODELS]
    seen: set[str] = set()

    for candidate in models_to_try:
        if candidate in seen:
            continue
        seen.add(candidate)
        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel(
                model_name=candidate,
                system_instruction=system_prompt,
            )
            response = model.generate_content(
                user_prompt,
                generation_config={
                    "temperature": 0.4,
                    "max_output_tokens": 16384,
                    "response_mime_type": "application/json",
                    "response_schema": {
                        "type": "OBJECT",
                        "properties": {
                            "html_email": {"type": "STRING"},
                            "telegram_summary": {"type": "STRING"},
                        },
                        "required": ["html_email", "telegram_summary"],
                    },
                },
            )
            report = _parse_report_json(response.text or "")
            if candidate != model_name:
                print(
                    f"  Used fallback model {candidate} (configured: {model_name}).",
                    file=sys.stderr,
                )
            return report
        except Exception as exc:
            print(f"Gemini model {candidate} failed: {exc}", file=sys.stderr)

    print("All Gemini models failed. Using fallback report template.", file=sys.stderr)
    return _build_fallback_report(
        client_name,
        report_date,
        technical_rows,
        news,
        psx_events,
        portfolio_summary,
    )


def generate_portfolio_html(
    api_key: str,
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
) -> str:
    """Generate portfolio analysis HTML for the API (no Telegram delivery)."""
    report = generate_report(
        api_key=api_key,
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
    )
    return report["html_email"]


def generate_report_html(
    api_key: str,
    model_name: str,
    report_date: str,
    technical_text: str,
    technical_rows: list[dict[str, Any]],
    news: list[dict[str, str]],
    news_text: str,
    psx_events: dict[str, Any],
    client_name: str = "Client",
) -> str:
    """Backward-compatible wrapper returning only the HTML email body."""
    from fetchers import compute_portfolio_summary, format_portfolio_summary_for_prompt

    summary = compute_portfolio_summary(technical_rows)
    return generate_portfolio_html(
        api_key=api_key,
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
   Ticker | Thesis | Suggested Buy Price | Risk Note

2. Weekly Top 5 Picks — HTML table with the same columns.

3. Monthly Top 5 Picks — HTML table with the same columns.

Each section must contain exactly 5 rows. Use professional, institutional tone.
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
    api_key: str,
    model_name: str,
    report_date: str,
    news: list[dict[str, str]],
    news_text: str,
) -> str:
    """Generate Daily/Weekly/Monthly Top 5 Picks HTML using Gemini."""
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

    models_to_try = [model_name, *FALLBACK_MODELS]
    seen: set[str] = set()

    for candidate in models_to_try:
        if candidate in seen:
            continue
        seen.add(candidate)
        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel(
                model_name=candidate,
                system_instruction=TOP_PICKS_SYSTEM_PROMPT,
            )
            response = model.generate_content(
                user_prompt,
                generation_config={
                    "temperature": 0.4,
                    "max_output_tokens": 16384,
                    "response_mime_type": "application/json",
                    "response_schema": {
                        "type": "OBJECT",
                        "properties": {
                            "report_html": {"type": "STRING"},
                        },
                        "required": ["report_html"],
                    },
                },
            )
            report_html = _parse_top_picks_json(response.text or "")
            if candidate != model_name:
                print(
                    f"  Used fallback model {candidate} (configured: {model_name}).",
                    file=sys.stderr,
                )
            return report_html
        except Exception as exc:
            print(f"Gemini model {candidate} failed: {exc}", file=sys.stderr)

    print("All Gemini models failed. Using fallback top picks template.", file=sys.stderr)
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


def _normalize_pick_item(item: dict[str, Any]) -> dict[str, str]:
    return {
        "symbol": str(item.get("symbol", "")).strip().upper(),
        "sector": str(item.get("sector", "Unknown")).strip() or "Unknown",
        "summary": str(item.get("summary", "")).strip(),
        "why": str(item.get("why", "")).strip(),
        "outlook_short": str(item.get("outlook_short", "")).strip(),
        "outlook_long": str(item.get("outlook_long", "")).strip(),
        "buy_zone": str(item.get("buy_zone", "")).strip(),
        "current_price": str(item.get("current_price", "N/A")).strip() or "N/A",
        "exit_target": str(item.get("exit_target", "N/A")).strip() or "N/A",
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
    api_key: str,
    model_name: str,
    report_date: str,
    news: list[dict[str, str]],
    news_text: str,
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

Base picks on news headlines and PSX market trends. Label as AI suggestions, not fatwas."""

    models_to_try = [model_name, *FALLBACK_MODELS]
    seen: set[str] = set()

    for candidate in models_to_try:
        if candidate in seen:
            continue
        seen.add(candidate)
        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel(
                model_name=candidate,
                system_instruction=TOP_PICKS_STRUCTURED_SYSTEM_PROMPT,
            )
            response = model.generate_content(
                user_prompt,
                generation_config={
                    "temperature": 0.4,
                    "max_output_tokens": 16384,
                    "response_mime_type": "application/json",
                    "response_schema": {
                        "type": "OBJECT",
                        "properties": {
                            "report_html": {"type": "STRING"},
                            "daily_picks": {
                                "type": "ARRAY",
                                "items": _PICK_ITEM_SCHEMA,
                            },
                            "monthly_picks": {
                                "type": "ARRAY",
                                "items": _PICK_ITEM_SCHEMA,
                            },
                            "yearly_picks": {
                                "type": "ARRAY",
                                "items": _PICK_ITEM_SCHEMA,
                            },
                        },
                        "required": [
                            "report_html",
                            "daily_picks",
                            "monthly_picks",
                            "yearly_picks",
                        ],
                    },
                },
            )
            result = _parse_top_picks_structured(response.text or "")
            if candidate != model_name:
                print(
                    f"  Used fallback model {candidate} (configured: {model_name}).",
                    file=sys.stderr,
                )
            return result
        except Exception as exc:
            print(f"Gemini model {candidate} failed: {exc}", file=sys.stderr)

    print("All Gemini models failed. Using fallback top picks template.", file=sys.stderr)
    return {
        "report_html": _build_fallback_top_picks_html(report_date, news),
        "daily_picks": [],
        "monthly_picks": [],
        "yearly_picks": [],
    }
