"""The news archive keeps every headline, while news_items keeps only the current feed."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from sqlalchemy import func, select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipeline import db  # noqa: E402


def headline(link: str, title: str = "PSX closes higher") -> dict:
    return {
        "region": "pakistan",
        "title": title,
        "snippet": "Benchmark up",
        "source": "Test Wire",
        "link": link,
        "published_at": None,
    }


@pytest.fixture()
def empty_db(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'news.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    db.configure_engine(url)
    db.Base.metadata.create_all(bind=db.get_engine())


def archived_links() -> list[str]:
    with db.session_scope() as session:
        return list(session.execute(select(db.NewsArchive.link).order_by(db.NewsArchive.id)).scalars())


def test_archive_accumulates_across_runs_while_live_feed_is_replaced(empty_db):
    first = [headline("https://example.com/a"), headline("https://example.com/b")]
    second = [headline("https://example.com/b"), headline("https://example.com/c")]

    for rows in (first, second):
        db.replace_news(rows)
        db.archive_news(rows)

    assert [row["link"] for row in db.recent_news()] == ["https://example.com/b", "https://example.com/c"]
    assert archived_links() == ["https://example.com/a", "https://example.com/b", "https://example.com/c"]


def test_archive_counts_only_new_links_and_skips_blank_or_repeated_ones(empty_db):
    assert db.archive_news([headline("https://example.com/a"), headline("")]) == 1
    rows = [headline("https://example.com/a"), headline("https://example.com/d"), headline("https://example.com/d")]
    assert db.archive_news(rows) == 1
    with db.session_scope() as session:
        assert session.execute(select(func.count()).select_from(db.NewsArchive)).scalar_one() == 2
