"""Plain SMTP email, for price alerts.

Works with any SMTP service: Resend, Brevo, Amazon SES or a Google Workspace
mailbox. Nothing is sent unless SMTP_HOST and MAIL_FROM are set, so the
pipeline runs the same with or without a mail provider; alerts still show on
the site either way.
"""

from __future__ import annotations

import logging
import os
import smtplib
from email.message import EmailMessage

logger = logging.getLogger("smartsarmaya.mailer")


def is_configured() -> bool:
    return bool(os.environ.get("SMTP_HOST") and os.environ.get("MAIL_FROM"))


def send(to: str, subject: str, text: str) -> bool:
    """Send one plain-text email. Returns False instead of raising."""
    if not is_configured() or not to:
        return False
    message = EmailMessage()
    message["From"] = os.environ["MAIL_FROM"]
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text)

    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT") or 587)
    username = os.environ.get("SMTP_USERNAME") or ""
    password = os.environ.get("SMTP_PASSWORD") or ""
    try:
        # 465 is implicit TLS; anything else upgrades with STARTTLS.
        if port == 465:
            server: smtplib.SMTP = smtplib.SMTP_SSL(host, port, timeout=20)
        else:
            server = smtplib.SMTP(host, port, timeout=20)
            server.starttls()
        with server:
            if username:
                server.login(username, password)
            server.send_message(message)
        return True
    except (smtplib.SMTPException, OSError):
        logger.exception("Could not send an alert email.")
        return False
