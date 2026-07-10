"""
Neon PostgreSQL persistence for SmartSarmaya V5 read layer.
"""

from __future__ import annotations

import json
import logging
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Generator, Iterator

from dotenv import load_dotenv
from sqlalchemy import DateTime, Float, Integer, String, Text, create_engine, delete, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from sqlalchemy.types import JSON

logger = logging.getLogger("smartsarmaya.database")

TOP_PICK_CATEGORIES = ("daily", "monthly", "yearly")
NEWS_EVENT_TYPES = ("news", "dividend", "board_meeting")


class DatabaseUnavailableError(RuntimeError):
    """Raised when DATABASE_URL is missing or the database cannot be reached."""


class Base(DeclarativeBase):
    pass


class TickerData(Base):
    __tablename__ = "ticker_data"

    symbol: Mapped[str] = mapped_column(String(16), primary_key=True)
    current_price: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    high: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    low: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    change: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )


class TopPicks(Base):
    __tablename__ = "top_picks"

    category: Mapped[str] = mapped_column(String(16), primary_key=True)
    ai_response_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )


class NewsAndEvents(Base):
    __tablename__ = "news_and_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    title_or_symbol: Mapped[str] = mapped_column(String(1024), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    link_or_date: Mapped[str] = mapped_column(Text, nullable=False, default="")
    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )


_engine = None
_SessionLocal: sessionmaker[Session] | None = None


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def get_database_url() -> str:
    load_dotenv()
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url:
        raise DatabaseUnavailableError(
            "Missing required environment variable: DATABASE_URL"
        )
    return url


def _build_engine(database_url: str | None = None):
    url = database_url or get_database_url()
    connect_args: dict[str, str] = {}
    if url.startswith("postgresql") and "sslmode=" not in url:
        connect_args["sslmode"] = "require"
    return create_engine(
        url,
        pool_pre_ping=True,
        connect_args=connect_args or {},
    )


def configure_engine(database_url: str | None = None) -> None:
    """Initialize or replace the global engine (used by tests)."""
    global _engine, _SessionLocal
    _engine = _build_engine(database_url) if database_url else _build_engine()
    _SessionLocal = sessionmaker(
        bind=_engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )


def get_engine():
    global _engine, _SessionLocal
    if _engine is None:
        configure_engine()
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    global _SessionLocal
    if _SessionLocal is None:
        configure_engine()
    assert _SessionLocal is not None
    return _SessionLocal


@contextmanager
def session_scope() -> Iterator[Session]:
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_db() -> Generator[Session, None, None]:
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()


def _migrate_neon_columns() -> None:
    """Widen news/event text columns on existing Neon deployments."""
    engine = get_engine()
    if engine.dialect.name != "postgresql":
        return
    statements = [
        "ALTER TABLE news_and_events ALTER COLUMN link_or_date TYPE TEXT",
        "ALTER TABLE news_and_events ALTER COLUMN description TYPE TEXT",
        "ALTER TABLE news_and_events ALTER COLUMN title_or_symbol TYPE VARCHAR(1024)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            try:
                conn.execute(text(stmt))
            except SQLAlchemyError as exc:
                logger.debug("Migration skipped or already applied (%s): %s", stmt, exc)


def init_db() -> None:
    """Create tables if they do not exist."""
    try:
        Base.metadata.create_all(bind=get_engine())
        _migrate_neon_columns()
        logger.info("Database tables initialized.")
    except DatabaseUnavailableError:
        logger.warning("DATABASE_URL not set; skipping init_db().")
    except SQLAlchemyError:
        logger.exception("Failed to initialize database tables.")
        raise


def upsert_ticker_rows(rows: list[dict[str, Any]]) -> int:
    if not rows:
        return 0
    now = _utc_now()
    payload = []
    for row in rows:
        symbol = str(row.get("symbol", "")).strip().upper()
        if not symbol:
            continue
        change_value = row.get("change", 0)
        payload.append(
            {
                "symbol": symbol,
                "current_price": float(row.get("current_price") or 0),
                "high": float(row.get("high") or 0),
                "low": float(row.get("low") or 0),
                "change": str(change_value),
                "last_updated": now,
            }
        )
    if not payload:
        return 0

    with session_scope() as session:
        dialect = session.bind.dialect.name if session.bind else ""
        if dialect == "postgresql":
            stmt = pg_insert(TickerData).values(payload)
            stmt = stmt.on_conflict_do_update(
                index_elements=[TickerData.symbol],
                set_={
                    "current_price": stmt.excluded.current_price,
                    "high": stmt.excluded.high,
                    "low": stmt.excluded.low,
                    "change": stmt.excluded.change,
                    "last_updated": stmt.excluded.last_updated,
                },
            )
            session.execute(stmt)
        else:
            for item in payload:
                existing = session.get(TickerData, item["symbol"])
                if existing:
                    existing.current_price = item["current_price"]
                    existing.high = item["high"]
                    existing.low = item["low"]
                    existing.change = item["change"]
                    existing.last_updated = item["last_updated"]
                else:
                    session.add(TickerData(**item))
    return len(payload)


def upsert_top_picks(category: str, json_payload: dict[str, Any]) -> None:
    category = category.strip().lower()
    if category not in TOP_PICK_CATEGORIES:
        raise ValueError(f"Invalid top picks category: {category}")

    now = _utc_now()
    with session_scope() as session:
        dialect = session.bind.dialect.name if session.bind else ""
        values = {
            "category": category,
            "ai_response_json": json_payload,
            "last_updated": now,
        }
        if dialect == "postgresql":
            stmt = pg_insert(TopPicks).values(values)
            stmt = stmt.on_conflict_do_update(
                index_elements=[TopPicks.category],
                set_={
                    "ai_response_json": stmt.excluded.ai_response_json,
                    "last_updated": stmt.excluded.last_updated,
                },
            )
            session.execute(stmt)
        else:
            existing = session.get(TopPicks, category)
            if existing:
                existing.ai_response_json = json_payload
                existing.last_updated = now
            else:
                session.add(TopPicks(**values))


def replace_news_and_events(records: list[dict[str, Any]]) -> int:
    if not records:
        return 0
    now = _utc_now()
    types_to_refresh = {str(row.get("type", "")).strip().lower() for row in records}
    types_to_refresh.discard("")

    with session_scope() as session:
        if types_to_refresh:
            session.execute(
                delete(NewsAndEvents).where(NewsAndEvents.type.in_(types_to_refresh))
            )
        for row in records:
            session.add(
                NewsAndEvents(
                    type=str(row.get("type", "")).strip().lower(),
                    title_or_symbol=str(row.get("title_or_symbol", "")).strip(),
                    description=str(row.get("description", "")).strip(),
                    link_or_date=str(row.get("link_or_date", "")).strip(),
                    last_updated=now,
                )
            )
    return len(records)


def get_all_tickers() -> list[TickerData]:
    with session_scope() as session:
        return list(session.scalars(select(TickerData).order_by(TickerData.symbol)).all())


def get_top_picks_rows(category: str | None = None) -> list[TopPicks]:
    with session_scope() as session:
        if category:
            row = session.get(TopPicks, category.strip().lower())
            return [row] if row else []
        return list(
            session.scalars(
                select(TopPicks).where(TopPicks.category.in_(TOP_PICK_CATEGORIES))
            ).all()
        )


def get_news_and_events(
    *,
    limit: int = 50,
    event_type: str | None = None,
) -> list[NewsAndEvents]:
    with session_scope() as session:
        stmt = select(NewsAndEvents).order_by(NewsAndEvents.last_updated.desc())
        if event_type:
            stmt = stmt.where(NewsAndEvents.type == event_type.strip().lower())
        stmt = stmt.limit(max(1, min(limit, 200)))
        return list(session.scalars(stmt).all())


def parse_news_metadata(description: str) -> dict[str, str | None]:
    try:
        data = json.loads(description)
        if isinstance(data, dict):
            return {
                "snippet": str(data.get("snippet") or "").strip() or None,
                "source": str(data.get("source") or "").strip() or None,
                "region": str(data.get("region") or "").strip().lower() or None,
            }
    except json.JSONDecodeError:
        pass
    return {"snippet": description or None, "source": None, "region": None}
