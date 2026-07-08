"""
PSX V2.0 Advanced AI Trading Bot — main orchestrator.

Fetches portfolio data, news, and PSX corporate events, generates an AI HTML
report via Gemini, and emails it via Gmail SMTP.
"""

import os
import smtplib
import sys
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

from ai_agent import generate_report_html
from fetchers import (
    fetch_pakistan_news,
    fetch_psx_corporate_events,
    fetch_technical_data,
    format_news_for_prompt,
    parse_portfolio,
)

DEFAULT_PORTFOLIO = (
    "DGKC:227.40:500,EFERT:202.83:200,FABL:95.44:300,FFC:554.57:100,"
    "FFL:19.70:1000,HUBC:218.38:1000,LUCK:452.85:150,MARI:671.18:100,"
    "OGDC:300.39:300,POL:663.57:100,PPL:231.76:200,PSO:382.00:150"
)
DEFAULT_MODEL = "gemini-2.5-flash"
FALLBACK_MODELS = ("gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash")
PKT = ZoneInfo("Asia/Karachi")


def load_config() -> dict[str, Any]:
    """Load and validate all required environment variables."""
    load_dotenv()

    sender_email = os.getenv("SENDER_EMAIL", "").strip()
    sender_password = os.getenv("SENDER_PASSWORD", "").strip()
    receiver_email = os.getenv("RECEIVER_EMAIL", "").strip()
    gemini_api_key = os.getenv("GEMINI_API_KEY", "").strip()
    model_name = os.getenv("AI_MODEL_NAME", DEFAULT_MODEL).strip() or DEFAULT_MODEL
    portfolio_raw = os.getenv("PORTFOLIO", DEFAULT_PORTFOLIO).strip()

    missing = [
        name
        for name, value in [
            ("SENDER_EMAIL", sender_email),
            ("SENDER_PASSWORD", sender_password),
            ("RECEIVER_EMAIL", receiver_email),
            ("GEMINI_API_KEY", gemini_api_key),
        ]
        if not value
    ]
    if missing:
        raise ValueError(
            f"Missing required environment variables: {', '.join(missing)}"
        )

    portfolio = parse_portfolio(portfolio_raw)
    if not portfolio:
        raise ValueError(
            "PORTFOLIO must contain at least one SYMBOL:BUY_PRICE:QUANTITY entry."
        )

    return {
        "sender_email": sender_email,
        "sender_password": sender_password,
        "receiver_email": receiver_email,
        "gemini_api_key": gemini_api_key,
        "model_name": model_name,
        "portfolio": portfolio,
    }


def send_email(
    sender_email: str,
    sender_password: str,
    receiver_email: str,
    subject: str,
    html_body: str,
) -> None:
    """Send the AI-generated HTML report via Gmail SMTP over SSL (port 465)."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender_email
    msg["To"] = receiver_email

    plain_stub = (
        "Your PSX AI Daily Brief is available in HTML format. "
        "Please view this email in an HTML-capable client."
    )
    msg.attach(MIMEText(plain_stub, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(sender_email, sender_password)
        server.send_message(msg)


def main() -> int:
    """Orchestrate data fetching, AI report generation, and email delivery."""
    try:
        config = load_config()
    except ValueError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 1

    report_date = datetime.now(PKT).strftime("%A, %d %B %Y")
    portfolio = config["portfolio"]
    print(f"Generating PSX AI daily brief for {report_date}...")

    print("Fetching technical data...")
    technical_rows, technical_text = fetch_technical_data(portfolio)
    print(f"  Processed {len(technical_rows)} symbols.")

    print("Fetching Pakistan news...")
    news = fetch_pakistan_news(limit=3)
    news_text = format_news_for_prompt(news)
    print(f"  Retrieved {len(news)} headlines.")

    print("Scraping PSX corporate events...")
    psx_events = fetch_psx_corporate_events(set(portfolio.keys()))
    print(
        f"  Payouts: {len(psx_events['payouts'])}, "
        f"Board meetings: {len(psx_events['board_meetings'])}."
    )

    print(f"Generating AI report via {config['model_name']}...")
    html_body = generate_report_html(
        api_key=config["gemini_api_key"],
        model_name=config["model_name"],
        report_date=report_date,
        technical_text=technical_text,
        technical_rows=technical_rows,
        news=news,
        news_text=news_text,
        psx_events=psx_events,
    )
    print("  Report generated.")

    subject = f"PSX AI Daily Brief — {report_date} (PKT)"
    print("Sending email...")
    try:
        send_email(
            sender_email=config["sender_email"],
            sender_password=config["sender_password"],
            receiver_email=config["receiver_email"],
            subject=subject,
            html_body=html_body,
        )
    except Exception as exc:
        print(f"Failed to send email: {exc}", file=sys.stderr)
        return 1

    print("Report sent successfully.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
