"""Neon Postgres schema and write helpers for the SmartSarmaya pipeline.

The pipeline is the only writer. The Next.js app on Vercel reads these tables
directly over the Neon HTTP driver, so every page view is a plain indexed
SELECT with no Python process in the path.

Schema
------
stocks           one row per listed symbol: identity, halal flag, live quote,
                 and derived technicals
market_index     daily index closes plus the latest intraday sparkline
movers           top gainers / losers / most active, replaced each run
sector_stats     advance-decline and turnover per sector
corporate_events AGM / EOGM / board meetings
payouts          dividend announcements and book closure windows
news_items       Pakistan and global market headlines
top_picks        AI picks keyed by (timeframe, sector, pick_date) so history
                 accumulates instead of being overwritten
pick_track       per-pick entry price and running return, for the scorecard
daily_briefs     AI market brief, one per session per day
stock_notes      AI written commentary for each stock detail page
"""

from __future__ import annotations

import json
import logging
import os
from contextlib import contextmanager
from datetime import date, datetime, timezone
from typing import Any, Iterable, Iterator

from dotenv import load_dotenv
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    delete,
    func,
    inspect,
    select,
    text,
)
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from sqlalchemy.types import JSON

logger = logging.getLogger("smartsarmaya.db")


class DatabaseUnavailableError(RuntimeError):
    """Raised when DATABASE_URL is missing or Neon cannot be reached."""


class Base(DeclarativeBase):
    pass


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------
# models
# --------------------------------------------------------------------------
class Stock(Base):
    __tablename__ = "stocks"

    symbol: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), default="")
    sector_code: Mapped[str] = mapped_column(String(8), default="", index=True)
    sector_name: Mapped[str] = mapped_column(String(128), default="")

    is_kmi: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_kmi30: Mapped[bool] = mapped_column(Boolean, default=False)
    is_kse100: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_etf: Mapped[bool] = mapped_column(Boolean, default=False)
    is_debt: Mapped[bool] = mapped_column(Boolean, default=False)

    # live quote
    ldcp: Mapped[float | None] = mapped_column(Float)
    open: Mapped[float | None] = mapped_column(Float)
    high: Mapped[float | None] = mapped_column(Float)
    low: Mapped[float | None] = mapped_column(Float)
    current_price: Mapped[float] = mapped_column(Float, default=0.0)
    change: Mapped[float] = mapped_column(Float, default=0.0)
    change_pct: Mapped[float] = mapped_column(Float, default=0.0)
    volume: Mapped[int] = mapped_column(Integer, default=0)
    quote_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # derived technicals
    rsi_14: Mapped[float | None] = mapped_column(Float)
    sma_20: Mapped[float | None] = mapped_column(Float)
    sma_50: Mapped[float | None] = mapped_column(Float)
    sma_200: Mapped[float | None] = mapped_column(Float)
    support: Mapped[float | None] = mapped_column(Float)
    resistance: Mapped[float | None] = mapped_column(Float)
    high_52w: Mapped[float | None] = mapped_column(Float)
    low_52w: Mapped[float | None] = mapped_column(Float)
    change_1w_pct: Mapped[float | None] = mapped_column(Float)
    change_1m_pct: Mapped[float | None] = mapped_column(Float)
    change_3m_pct: Mapped[float | None] = mapped_column(Float)
    change_1y_pct: Mapped[float | None] = mapped_column(Float)
    volatility_pct: Mapped[float | None] = mapped_column(Float)
    avg_volume_30d: Mapped[int | None] = mapped_column(Integer)
    trend: Mapped[str] = mapped_column(String(32), default="")
    signal: Mapped[str] = mapped_column(String(24), default="")
    tech_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class MarketIndex(Base):
    __tablename__ = "market_index"
    __table_args__ = (UniqueConstraint("name", "day", name="uq_market_index_name_day"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(24), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    value: Mapped[float] = mapped_column(Float, default=0.0)
    change: Mapped[float] = mapped_column(Float, default=0.0)
    change_pct: Mapped[float] = mapped_column(Float, default=0.0)
    sparkline: Mapped[list[Any]] = mapped_column(JSON, default=list)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)


class Mover(Base):
    __tablename__ = "movers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(16), index=True)  # gainers|losers|most_active
    rank: Mapped[int] = mapped_column(Integer, default=0)
    symbol: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(256), default="")
    price: Mapped[float] = mapped_column(Float, default=0.0)
    change: Mapped[float] = mapped_column(Float, default=0.0)
    change_pct: Mapped[float] = mapped_column(Float, default=0.0)
    volume: Mapped[int] = mapped_column(Integer, default=0)
    is_kmi: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)


class SectorStat(Base):
    __tablename__ = "sector_stats"

    sector_code: Mapped[str] = mapped_column(String(8), primary_key=True)
    sector_name: Mapped[str] = mapped_column(String(128), default="")
    advance: Mapped[int] = mapped_column(Integer, default=0)
    decline: Mapped[int] = mapped_column(Integer, default=0)
    unchanged: Mapped[int] = mapped_column(Integer, default=0)
    turnover: Mapped[int] = mapped_column(Integer, default=0)
    market_cap_bn: Mapped[float] = mapped_column(Float, default=0.0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)


class CorporateEvent(Base):
    __tablename__ = "corporate_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(20), index=True)
    company: Mapped[str] = mapped_column(String(256), default="")
    event_type: Mapped[str] = mapped_column(String(32), default="")
    event_date: Mapped[date | None] = mapped_column(Date, index=True)
    event_time: Mapped[str] = mapped_column(String(16), default="")
    city: Mapped[str] = mapped_column(String(64), default="")
    period_end: Mapped[str] = mapped_column(String(32), default="")
    is_kmi: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)


class Payout(Base):
    __tablename__ = "payouts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(20), index=True)
    company: Mapped[str] = mapped_column(String(256), default="")
    sector_name: Mapped[str] = mapped_column(String(128), default="")
    payout: Mapped[str] = mapped_column(String(128), default="")
    announced_on: Mapped[date | None] = mapped_column(Date)
    book_closure_from: Mapped[date | None] = mapped_column(Date, index=True)
    book_closure_to: Mapped[date | None] = mapped_column(Date)
    is_kmi: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)


class NewsItem(Base):
    __tablename__ = "news_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    region: Mapped[str] = mapped_column(String(16), index=True)  # pakistan|global
    title: Mapped[str] = mapped_column(String(512), default="")
    snippet: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(128), default="")
    link: Mapped[str] = mapped_column(Text, default="")
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)


class TopPick(Base):
    __tablename__ = "top_picks"
    __table_args__ = (
        UniqueConstraint("timeframe", "sector", "pick_date", name="uq_top_picks_tf_sector_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timeframe: Mapped[str] = mapped_column(String(16), index=True)
    sector: Mapped[str] = mapped_column(String(64), index=True)
    pick_date: Mapped[date] = mapped_column(Date, index=True)
    ai_response_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    model_used: Mapped[str] = mapped_column(String(64), default="")
    last_updated: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)


class PickTrack(Base):
    """Running scorecard: one row per symbol per sector/timeframe entry."""

    __tablename__ = "pick_track"
    __table_args__ = (
        UniqueConstraint("symbol", "timeframe", "sector", "entry_date", name="uq_pick_track_entry"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(20), index=True)
    timeframe: Mapped[str] = mapped_column(String(16), index=True)
    sector: Mapped[str] = mapped_column(String(64))
    entry_date: Mapped[date] = mapped_column(Date, index=True)
    entry_price: Mapped[float] = mapped_column(Float, default=0.0)
    exit_target: Mapped[float | None] = mapped_column(Float)
    last_price: Mapped[float] = mapped_column(Float, default=0.0)
    return_pct: Mapped[float] = mapped_column(Float, default=0.0)
    best_return_pct: Mapped[float] = mapped_column(Float, default=0.0)
    days_held: Mapped[int] = mapped_column(Integer, default=0)
    hit_target: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)


class DailyBrief(Base):
    __tablename__ = "daily_briefs"
    __table_args__ = (UniqueConstraint("brief_date", "session", name="uq_brief_date_session"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    brief_date: Mapped[date] = mapped_column(Date, index=True)
    session: Mapped[str] = mapped_column(String(16), index=True)  # morning|closing
    headline: Mapped[str] = mapped_column(String(300), default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    body_html: Mapped[str] = mapped_column(Text, default="")
    key_points: Mapped[list[Any]] = mapped_column(JSON, default=list)
    symbols: Mapped[list[Any]] = mapped_column(JSON, default=list)
    index_value: Mapped[float | None] = mapped_column(Float)
    index_change_pct: Mapped[float | None] = mapped_column(Float)
    model_used: Mapped[str] = mapped_column(String(64), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)


class StockNote(Base):
    __tablename__ = "stock_notes"

    symbol: Mapped[str] = mapped_column(String(20), primary_key=True)
    headline: Mapped[str] = mapped_column(String(300), default="")
    overview: Mapped[str] = mapped_column(Text, default="")
    bull_case: Mapped[str] = mapped_column(Text, default="")
    bear_case: Mapped[str] = mapped_column(Text, default="")
    verdict: Mapped[str] = mapped_column(String(32), default="")
    model_used: Mapped[str] = mapped_column(String(64), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)


# --------------------------------------------------------------------------
# engine
# --------------------------------------------------------------------------
_engine = None
_SessionLocal: sessionmaker[Session] | None = None


def get_database_url() -> str:
    load_dotenv()
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url:
        raise DatabaseUnavailableError("Missing required environment variable: DATABASE_URL")
    # SQLAlchemy 2 wants the psycopg2 dialect spelled out for some Neon URLs.
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    return url


def configure_engine(database_url: str | None = None) -> None:
    global _engine, _SessionLocal
    url = database_url or get_database_url()
    connect_args: dict[str, Any] = {}
    if url.startswith("postgresql") and "sslmode=" not in url:
        connect_args["sslmode"] = "require"
    _engine = create_engine(url, pool_pre_ping=True, connect_args=connect_args)
    _SessionLocal = sessionmaker(
        bind=_engine, autoflush=False, autocommit=False, expire_on_commit=False
    )


def get_engine():
    if _engine is None:
        configure_engine()
    return _engine


@contextmanager
def session_scope() -> Iterator[Session]:
    if _SessionLocal is None:
        configure_engine()
    assert _SessionLocal is not None
    session = _SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


# --------------------------------------------------------------------------
# schema management
# --------------------------------------------------------------------------
_INDEX_STATEMENTS = (
    "CREATE INDEX IF NOT EXISTS ix_stocks_kmi_price ON stocks (is_kmi, current_price)",
    "CREATE INDEX IF NOT EXISTS ix_top_picks_lookup ON top_picks (timeframe, sector, pick_date DESC)",
    "CREATE INDEX IF NOT EXISTS ix_payouts_bc ON payouts (book_closure_from)",
    "CREATE INDEX IF NOT EXISTS ix_events_date ON corporate_events (event_date)",
    "CREATE INDEX IF NOT EXISTS ix_briefs_recent ON daily_briefs (brief_date DESC, session)",
)


def _migrate_legacy() -> None:
    """Bring a database created by the previous version up to this schema.

    The old top_picks table was unique on (timeframe, sector), which meant each
    day's picks overwrote the day before and no track record could exist. This
    adds pick_date and swaps the constraint, preserving existing rows by dating
    them today.
    """
    engine = get_engine()
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    if "top_picks" in tables:
        columns = {col["name"] for col in inspector.get_columns("top_picks")}
        with engine.begin() as conn:
            if "category" in columns and "timeframe" not in columns:
                # Pre-V6 layout; the shape changed too much to be worth keeping.
                conn.execute(text("DROP TABLE top_picks"))
                logger.info("Dropped pre-V6 top_picks table.")
            elif "pick_date" not in columns:
                conn.execute(
                    text("ALTER TABLE top_picks ADD COLUMN pick_date DATE")
                )
                conn.execute(
                    text("UPDATE top_picks SET pick_date = CURRENT_DATE WHERE pick_date IS NULL")
                )
                conn.execute(text("ALTER TABLE top_picks ALTER COLUMN pick_date SET NOT NULL"))
                conn.execute(
                    text(
                        "ALTER TABLE top_picks "
                        "DROP CONSTRAINT IF EXISTS uq_top_picks_timeframe_sector"
                    )
                )
                logger.info("Added pick_date to top_picks so history is retained.")
            if "model_used" not in columns and "top_picks" in tables:
                try:
                    conn.execute(
                        text("ALTER TABLE top_picks ADD COLUMN IF NOT EXISTS model_used VARCHAR(64) DEFAULT ''")
                    )
                except SQLAlchemyError:
                    pass

    # ticker_data and news_and_events are superseded by stocks and news_items.
    with engine.begin() as conn:
        for legacy in ("ticker_data", "news_and_events"):
            if legacy in tables:
                conn.execute(text(f"DROP TABLE IF EXISTS {legacy}"))
                logger.info("Dropped superseded table %s.", legacy)


def init_db() -> None:
    """Create tables and indexes, and migrate an older database in place."""
    engine = get_engine()
    try:
        _migrate_legacy()
        Base.metadata.create_all(bind=engine)
        with engine.begin() as conn:
            for statement in _INDEX_STATEMENTS:
                try:
                    conn.execute(text(statement))
                except SQLAlchemyError as exc:
                    logger.debug("Index statement skipped (%s): %s", statement, exc)
        logger.info("Database schema is ready.")
    except SQLAlchemyError:
        logger.exception("Failed to initialise the database schema.")
        raise


# --------------------------------------------------------------------------
# writes
# --------------------------------------------------------------------------
def _is_postgres(session: Session) -> bool:
    return bool(session.bind) and session.bind.dialect.name == "postgresql"


def _upsert(session: Session, model, rows: list[dict[str, Any]], key: list[str]) -> int:
    """Insert or update on the given key columns.

    Uses the Postgres ON CONFLICT form in production. The portable fallback
    keeps the pipeline runnable against SQLite, which is how it is tested
    without Neon credentials.
    """
    if not rows:
        return 0

    if _is_postgres(session):
        stmt = pg_insert(model).values(rows)
        update_cols = {
            col.name: stmt.excluded[col.name]
            for col in model.__table__.columns
            if col.name not in key and not col.primary_key
        }
        if update_cols:
            stmt = stmt.on_conflict_do_update(index_elements=key, set_=update_cols)
        else:
            stmt = stmt.on_conflict_do_nothing(index_elements=key)
        session.execute(stmt)
        return len(rows)

    for row in rows:
        conditions = [getattr(model, column) == row[column] for column in key]
        existing = session.execute(select(model).where(*conditions)).scalar_one_or_none()
        if existing is None:
            session.add(model(**row))
        else:
            for column, value in row.items():
                if column not in key:
                    setattr(existing, column, value)
    session.flush()
    return len(rows)


def _insert_many(session: Session, model, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    if _is_postgres(session):
        session.execute(pg_insert(model).values(rows))
    else:
        session.add_all([model(**row) for row in rows])


def _insert_ignore(session: Session, model, rows: list[dict[str, Any]], key: list[str]) -> None:
    if not rows:
        return
    if _is_postgres(session):
        session.execute(
            pg_insert(model).values(rows).on_conflict_do_nothing(index_elements=key)
        )
        return
    for row in rows:
        conditions = [getattr(model, column) == row[column] for column in key]
        if session.execute(select(model).where(*conditions)).scalar_one_or_none() is None:
            session.add(model(**row))
    session.flush()


def upsert_stocks(rows: list[dict[str, Any]]) -> int:
    if not rows:
        return 0
    with session_scope() as session:
        return _upsert(session, Stock, rows, ["symbol"])


def upsert_index_snapshot(
    name: str, day: date, value: float, change: float, change_pct: float, sparkline: list[float]
) -> None:
    with session_scope() as session:
        _upsert(
            session,
            MarketIndex,
            [
                {
                    "name": name,
                    "day": day,
                    "value": value,
                    "change": change,
                    "change_pct": change_pct,
                    "sparkline": sparkline,
                    "updated_at": _utc_now(),
                }
            ],
            ["name", "day"],
        )


def upsert_index_history(name: str, history: Iterable[tuple[date, float]]) -> int:
    rows = [
        {"name": name, "day": day, "value": value, "sparkline": [], "updated_at": _utc_now()}
        for day, value in history
    ]
    if not rows:
        return 0
    with session_scope() as session:
        # Only fill days that are missing so today's live sparkline is not wiped.
        existing = {
            row[0]
            for row in session.execute(
                select(MarketIndex.day).where(MarketIndex.name == name)
            ).all()
        }
        fresh = [row for row in rows if row["day"] not in existing]
        if not fresh:
            return 0
        _insert_ignore(session, MarketIndex, fresh, ["name", "day"])
        return len(fresh)


def replace_movers(buckets: dict[str, list[dict[str, Any]]], halal: set[str]) -> int:
    rows: list[dict[str, Any]] = []
    now = _utc_now()
    for kind, items in buckets.items():
        for rank, item in enumerate(items, start=1):
            rows.append(
                {
                    "kind": kind,
                    "rank": rank,
                    "symbol": item["symbol"],
                    "name": item.get("name", ""),
                    "price": item.get("price", 0.0),
                    "change": item.get("change", 0.0),
                    "change_pct": item.get("change_pct", 0.0),
                    "volume": item.get("volume", 0),
                    "is_kmi": item["symbol"] in halal,
                    "updated_at": now,
                }
            )
    with session_scope() as session:
        session.execute(delete(Mover))
        _insert_many(session, Mover, rows)
    return len(rows)


def upsert_sector_stats(rows: list[dict[str, Any]]) -> int:
    if not rows:
        return 0
    payload = [{**row, "updated_at": _utc_now()} for row in rows]
    with session_scope() as session:
        return _upsert(session, SectorStat, payload, ["sector_code"])


def replace_corporate_events(rows: list[dict[str, Any]]) -> int:
    with session_scope() as session:
        session.execute(delete(CorporateEvent))
        _insert_many(session, CorporateEvent, rows)
    return len(rows)


def replace_payouts(rows: list[dict[str, Any]]) -> int:
    with session_scope() as session:
        session.execute(delete(Payout))
        _insert_many(session, Payout, rows)
    return len(rows)


def replace_news(rows: list[dict[str, Any]]) -> int:
    with session_scope() as session:
        session.execute(delete(NewsItem))
        _insert_many(session, NewsItem, rows)
    return len(rows)


def upsert_top_picks(
    timeframe: str, sector: str, pick_date: date, payload: dict[str, Any], model_used: str = ""
) -> None:
    with session_scope() as session:
        _upsert(
            session,
            TopPick,
            [
                {
                    "timeframe": timeframe,
                    "sector": sector,
                    "pick_date": pick_date,
                    "ai_response_json": payload,
                    "model_used": model_used,
                    "last_updated": _utc_now(),
                }
            ],
            ["timeframe", "sector", "pick_date"],
        )


def get_latest_picks(timeframe: str, sector: str) -> dict[str, Any] | None:
    with session_scope() as session:
        row = session.execute(
            select(TopPick)
            .where(TopPick.timeframe == timeframe, TopPick.sector == sector)
            .order_by(TopPick.pick_date.desc())
            .limit(1)
        ).scalar_one_or_none()
        if row is None:
            return None
        return {"pick_date": row.pick_date, "payload": row.ai_response_json or {}}


def upsert_brief(row: dict[str, Any]) -> None:
    with session_scope() as session:
        _upsert(session, DailyBrief, [{**row, "updated_at": _utc_now()}], ["brief_date", "session"])


def upsert_stock_notes(rows: list[dict[str, Any]]) -> int:
    if not rows:
        return 0
    payload = [{**row, "updated_at": _utc_now()} for row in rows]
    with session_scope() as session:
        return _upsert(session, StockNote, payload, ["symbol"])


def record_pick_entries(rows: list[dict[str, Any]]) -> int:
    """Insert new scorecard entries, ignoring symbols already tracked today."""
    if not rows:
        return 0
    with session_scope() as session:
        _insert_ignore(
            session,
            PickTrack,
            [{**row, "updated_at": _utc_now()} for row in rows],
            ["symbol", "timeframe", "sector", "entry_date"],
        )
    return len(rows)


def refresh_pick_track(prices: dict[str, float], today: date) -> dict[str, int]:
    """Mark every open pick to market and settle the ones that hit target."""
    updated = 0
    settled = 0
    with session_scope() as session:
        open_rows = session.execute(
            select(PickTrack).where(PickTrack.status == "open")
        ).scalars().all()

        for row in open_rows:
            price = prices.get(row.symbol)
            if price is None or price <= 0 or row.entry_price <= 0:
                continue
            return_pct = (price - row.entry_price) / row.entry_price * 100
            row.last_price = price
            row.return_pct = round(return_pct, 2)
            row.best_return_pct = round(max(row.best_return_pct, return_pct), 2)
            row.days_held = (today - row.entry_date).days
            row.updated_at = _utc_now()

            if row.exit_target and price >= row.exit_target:
                row.hit_target = True
                row.status = "hit_target"
                settled += 1
            elif row.days_held >= 365:
                row.status = "closed"
                settled += 1
            updated += 1

    return {"updated": updated, "settled": settled}


def scorecard(timeframe: str | None = None) -> dict[str, Any]:
    """Aggregate performance of every tracked pick."""
    with session_scope() as session:
        stmt = select(PickTrack)
        if timeframe:
            stmt = stmt.where(PickTrack.timeframe == timeframe)
        rows = session.execute(stmt).scalars().all()

    if not rows:
        return {"total": 0, "winners": 0, "hit_rate": 0.0, "avg_return": 0.0, "best": None}

    returns = [row.return_pct for row in rows]
    winners = sum(1 for value in returns if value > 0)
    best = max(rows, key=lambda row: row.return_pct)

    return {
        "total": len(rows),
        "winners": winners,
        "hit_rate": round(winners / len(rows) * 100, 1),
        "avg_return": round(sum(returns) / len(returns), 2),
        "targets_hit": sum(1 for row in rows if row.hit_target),
        "best": {
            "symbol": best.symbol,
            "return_pct": best.return_pct,
            "entry_date": best.entry_date.isoformat(),
        },
    }


def halal_universe(sector_codes: Iterable[str] | None = None, min_price: float = 1.0) -> list[dict[str, Any]]:
    """Shariah-compliant, liquid symbols, optionally limited to sector codes."""
    with session_scope() as session:
        stmt = select(Stock).where(
            Stock.is_kmi.is_(True),
            Stock.current_price >= min_price,
            Stock.is_etf.is_(False),
            Stock.is_debt.is_(False),
        )
        if sector_codes:
            stmt = stmt.where(Stock.sector_code.in_(list(sector_codes)))
        rows = session.execute(stmt.order_by(Stock.volume.desc())).scalars().all()

    return [
        {
            "symbol": row.symbol,
            "name": row.name,
            "sector_code": row.sector_code,
            "sector_name": row.sector_name,
            "price": row.current_price,
            "change_pct": row.change_pct,
            "volume": row.volume,
            "avg_volume_30d": row.avg_volume_30d,
            "rsi_14": row.rsi_14,
            "sma_50": row.sma_50,
            "sma_200": row.sma_200,
            "support": row.support,
            "resistance": row.resistance,
            "high_52w": row.high_52w,
            "low_52w": row.low_52w,
            "change_1m_pct": row.change_1m_pct,
            "change_1y_pct": row.change_1y_pct,
            "trend": row.trend,
            "signal": row.signal,
        }
        for row in rows
    ]


def price_lookup(symbols: Iterable[str] | None = None) -> dict[str, float]:
    with session_scope() as session:
        stmt = select(Stock.symbol, Stock.current_price).where(Stock.current_price > 0)
        if symbols:
            stmt = stmt.where(Stock.symbol.in_([s.strip().upper() for s in symbols]))
        return {symbol: price for symbol, price in session.execute(stmt).all()}


def recent_news(limit: int = 10, region: str | None = None) -> list[dict[str, Any]]:
    with session_scope() as session:
        stmt = select(NewsItem).order_by(NewsItem.id.asc())
        if region:
            stmt = stmt.where(NewsItem.region == region)
        rows = session.execute(stmt.limit(limit)).scalars().all()
    return [
        {
            "title": row.title,
            "snippet": row.snippet,
            "source": row.source,
            "link": row.link,
            "region": row.region,
        }
        for row in rows
    ]


def upcoming_events_for(symbols: Iterable[str], within_days: int = 45) -> dict[str, list[str]]:
    """Human readable upcoming events keyed by symbol, for prompt context."""
    wanted = {s.strip().upper() for s in symbols}
    if not wanted:
        return {}
    today = date.today()
    out: dict[str, list[str]] = {}

    with session_scope() as session:
        events = session.execute(
            select(CorporateEvent).where(
                CorporateEvent.symbol.in_(wanted),
                CorporateEvent.event_date.is_not(None),
                CorporateEvent.event_date >= today,
            )
        ).scalars().all()
        payouts = session.execute(
            select(Payout).where(
                Payout.symbol.in_(wanted),
                Payout.book_closure_from.is_not(None),
                Payout.book_closure_from >= today,
            )
        ).scalars().all()

    for event in events:
        if event.event_date and (event.event_date - today).days <= within_days:
            out.setdefault(event.symbol, []).append(
                f"{event.event_type} on {event.event_date.isoformat()}"
            )
    for payout in payouts:
        if payout.book_closure_from and (payout.book_closure_from - today).days <= within_days:
            out.setdefault(payout.symbol, []).append(
                f"payout {payout.payout}, book closure {payout.book_closure_from.isoformat()}"
            )
    return out


def table_counts() -> dict[str, int]:
    """Row counts for every table, used by the pipeline health check."""
    models = [
        Stock, MarketIndex, Mover, SectorStat, CorporateEvent,
        Payout, NewsItem, TopPick, PickTrack, DailyBrief, StockNote,
    ]
    counts: dict[str, int] = {}
    with session_scope() as session:
        for model in models:
            try:
                counts[model.__tablename__] = session.execute(
                    select(func.count()).select_from(model)
                ).scalar_one()
            except SQLAlchemyError:
                counts[model.__tablename__] = -1
    return counts
