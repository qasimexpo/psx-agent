"""Shared test setup.

The jobs publish through notify.py and social.py whenever credentials are
present in the environment, and `.env` on a developer machine may well hold
real ones. Strip every publishing credential before each test so the suite
can never post to Telegram, X, Facebook or Instagram.
"""

import pytest

PUBLISHING_VARS = (
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHANNEL_ID",
    "X_API_KEY",
    "X_API_SECRET",
    "X_ACCESS_TOKEN",
    "X_ACCESS_TOKEN_SECRET",
    "FACEBOOK_PAGE_ID",
    "FACEBOOK_PAGE_TOKEN",
    "INSTAGRAM_USER_ID",
)


@pytest.fixture(autouse=True)
def _no_publishing(monkeypatch):
    for name in PUBLISHING_VARS:
        monkeypatch.delenv(name, raising=False)
