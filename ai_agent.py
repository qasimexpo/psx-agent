"""
Gemini AI agent for generating personalized PSX portfolio HTML reports.
"""

import re
import sys
from html import escape
from typing import Any

import google.generativeai as genai

from fetchers import _format_pkr

FALLBACK_MODELS = ("gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash")

SYSTEM_PROMPT = """You are an elite Islamic Hedge Fund Manager analyzing the Pakistan Stock Exchange (PSX).

Your goal is to review the technical data, the user's buy price, quantities, PKR profit/loss, and news to give personalized holding/selling advice.

Important rules:
- Use the exact Qty and P/L (PKR) values provided in the technical data — do not recalculate them differently.
- Compare each holding's current price vs buy price and RSI levels when choosing Action and Target Exit Price.
- Ignore automated 'sell' signals on dividend stocks like EFERT or HUBC if they appear to be normal market corrections rather than structural breakdowns.
- When recommending Top 5 Shariah-Compliant Picks, base suggestions on provided news/trends and well-known PSX sectors. Clearly label these as AI investment suggestions, NOT religious rulings or fatwas.
- Write in a professional but human, conversational tone — like a trusted fund manager briefing a client.
- Output ONLY clean, modern HTML suitable for an email body. Use inline CSS only.
- Do NOT include markdown code fences, <script> tags, or external CSS/JS links.

You MUST include these four sections with clear headings:

1. Portfolio Action Plan — HTML table with EXACTLY these columns in order:
   Symbol | Qty | Buy Price | Current Price | P/L (PKR) | RSI | Action | Target Exit Price | Upcoming Events
   - P/L (PKR): use provided values exactly (e.g. +Rs. 5,000 or -Rs. 2,590)
   - Action: Hold, Buy More, Sell 50%, Exit, Monitor, etc.
   - Target Exit Price: specific numeric price using R1/S1 and RSI (e.g. "Sell at 245.00", "Cut loss below 216.00")
   - Upcoming Events: from portfolio_events_text; use "-" if none
   - Include EVERY symbol from the technical data — do not skip any row.

2. Top 5 Shariah-Compliant Picks — HTML table with columns:
   Ticker | Thesis | Suggested Buy Price | Risk Note
   - Suggested Buy Price: exact price or narrow range (e.g. Rs. 850–865)

3. Dividends & Board Meetings — display the scraped PSX data provided (or state if unavailable)

4. News Summary — a concise 2-3 sentence synthesis of the headlines
"""


def _strip_markdown_fences(text: str) -> str:
    """Remove accidental markdown code fences from AI output."""
    text = text.strip()
    text = re.sub(r"^```(?:html)?\s*", "", text, flags=re.IGNORECASE)
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


def _build_fallback_html(
    report_date: str,
    technical_rows: list[dict[str, Any]],
    news: list[dict[str, str]],
    psx_events: dict[str, Any],
) -> str:
    """Build a basic HTML report when Gemini is unavailable."""
    portfolio_events = psx_events.get("portfolio_events", {})
    table_rows = ""

    for row in technical_rows:
        symbol = row["symbol"]
        pl_pkr = _format_pkr(row.get("pl_amount"))
        upcoming = portfolio_events.get(symbol, "-")
        exit_price = _fallback_exit_price(row)

        table_rows += f"""
        <tr>
            <td style="padding:8px;border:1px solid #e5e7eb;"><strong>{escape(symbol)}</strong></td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">{escape(str(row.get('quantity', 'N/A')))}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">{escape(str(row.get('buy_price', 'N/A')))}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">{escape(str(row.get('current_price', 'N/A')))}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">{escape(pl_pkr)}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">{escape(str(row.get('rsi', 'N/A')))}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">Monitor</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">{escape(exit_price)}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">{escape(upcoming)}</td>
        </tr>"""

    news_items = ""
    for item in news:
        news_items += f"<li>{escape(item['title'])}</li>"
    if not news_items:
        news_items = "<li>No headlines available.</li>"

    body = f"""
    <h1 style="color:#111827;">PSX AI Daily Brief — {escape(report_date)}</h1>
    <p style="color:#b45309;background:#fffbeb;padding:12px;border-radius:6px;">
        AI analysis was unavailable. Showing raw fetched data below.
    </p>

    <h2>Portfolio Action Plan</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
            <tr style="background:#f3f4f6;">
                <th style="padding:8px;border:1px solid #e5e7eb;">Symbol</th>
                <th style="padding:8px;border:1px solid #e5e7eb;">Qty</th>
                <th style="padding:8px;border:1px solid #e5e7eb;">Buy Price</th>
                <th style="padding:8px;border:1px solid #e5e7eb;">Current Price</th>
                <th style="padding:8px;border:1px solid #e5e7eb;">P/L (PKR)</th>
                <th style="padding:8px;border:1px solid #e5e7eb;">RSI</th>
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
    return _wrap_html_document(body)


def generate_report_html(
    api_key: str,
    model_name: str,
    report_date: str,
    technical_text: str,
    technical_rows: list[dict[str, Any]],
    news: list[dict[str, str]],
    news_text: str,
    psx_events: dict[str, Any],
) -> str:
    """
    Generate the full HTML email report using Gemini.

    Falls back to a basic HTML template if the AI call fails.
    """
    user_prompt = f"""Generate today's PSX portfolio briefing email in HTML.

Report Date (PKT): {report_date}

=== TECHNICAL DATA (use Qty and P/L PKR exactly as shown) ===
{technical_text}

=== PORTFOLIO UPCOMING EVENTS (Upcoming Events column) ===
{psx_events.get('portfolio_events_text', 'No events in +/-15 day window.')}

=== NEWS HEADLINES ===
{news_text}

=== PSX PAYOUTS / DIVIDENDS ===
{psx_events.get('payouts_text', 'No payout data available.')}

=== PSX BOARD MEETINGS / ANNOUNCEMENTS ===
{psx_events.get('board_meetings_text', 'No board meeting data available.')}

Remember:
- Output ONLY the HTML email body with inline CSS and all four required sections.
- Portfolio Action Plan must have all 9 columns and every portfolio symbol.
- Use provided Qty and P/L (PKR) verbatim.
- Target Exit Price must reference R1/S1 from the technical data.
- Upcoming Events: use portfolio_events_text; "-" if none.
- Keep Dividends & Board Meetings concise (top 5 items each).
- You MUST end with section 4 News Summary."""

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
                system_instruction=SYSTEM_PROMPT,
            )
            response = model.generate_content(
                user_prompt,
                generation_config={
                    "temperature": 0.4,
                    "max_output_tokens": 16384,
                },
            )
            html = _strip_markdown_fences(response.text or "")
            if not html:
                raise ValueError("Empty response from Gemini")
            if candidate != model_name:
                print(
                    f"  Used fallback model {candidate} (configured: {model_name}).",
                    file=sys.stderr,
                )
            return _wrap_html_document(html)
        except Exception as exc:
            print(f"Gemini model {candidate} failed: {exc}", file=sys.stderr)

    print("All Gemini models failed. Using fallback HTML template.", file=sys.stderr)
    return _build_fallback_html(
        report_date, technical_rows, news, psx_events
    )
