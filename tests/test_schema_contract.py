"""The pipeline writes these tables; the Next.js app reads them.

Nothing in the type system connects the two, so a renamed column would only
surface as an empty section on the live site. This test parses the SQL in
`frontend/src/lib/db.ts` and asserts that every table and column it references
actually exists in the SQLAlchemy models.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipeline import db  # noqa: E402

DB_TS = ROOT / "frontend" / "src" / "lib" / "db.ts"

# Identifiers that appear in the SQL but are not columns.
SQL_NOISE = {
    "select", "from", "where", "and", "or", "order", "by", "group", "limit",
    "offset", "asc", "desc", "as", "on", "join", "left", "outer", "inner",
    "distinct", "count", "coalesce", "avg", "max", "min", "sum", "filter",
    "case", "when", "then", "else", "end", "is", "not", "null", "true",
    "false", "int", "current_date", "any", "like", "upper", "lower", "nulls",
    "first", "last", "in", "exists",
}


def _table_columns() -> dict[str, set[str]]:
    return {
        model.__tablename__: {column.name for column in model.__table__.columns}
        for model in (
            db.Stock, db.MarketIndex, db.Mover, db.SectorStat, db.CorporateEvent,
            db.Payout, db.NewsItem, db.TopPick, db.PickTrack, db.DailyBrief,
            db.StockNote, db.Subscriber,
        )
    }


def _strip_sql_comments(sql: str) -> str:
    """Drop `-- ...` comments, whose prose would otherwise read as columns."""
    return re.sub(r"--[^\n]*", "", sql)


def _sql_blocks() -> list[str]:
    """Every template literal passed to the tagged `query` helper."""
    source = DB_TS.read_text(encoding="utf-8")
    return [
        _strip_sql_comments(block)
        for block in re.findall(r"query<[^>]*>`(.*?)`", source, re.DOTALL)
    ]


@pytest.fixture(scope="module")
def blocks() -> list[str]:
    if not DB_TS.exists():
        pytest.skip("frontend/src/lib/db.ts not present")
    found = _sql_blocks()
    assert found, "No SQL template literals found; the parser needs updating."
    return found


def test_every_referenced_table_exists(blocks: list[str]) -> None:
    known = set(_table_columns())
    referenced: set[str] = set()
    for block in blocks:
        referenced.update(re.findall(r"\bFROM\s+([a-z_]+)", block, re.IGNORECASE))
        referenced.update(re.findall(r"\bJOIN\s+([a-z_]+)", block, re.IGNORECASE))

    unknown = referenced - known
    assert not unknown, f"Frontend queries unknown tables: {sorted(unknown)}"


def test_every_referenced_column_exists(blocks: list[str]) -> None:
    """Columns must belong to at least one table the query touches."""
    table_columns = _table_columns()
    problems: list[str] = []

    for block in blocks:
        tables = set(re.findall(r"\bFROM\s+([a-z_]+)", block, re.IGNORECASE))
        tables |= set(re.findall(r"\bJOIN\s+([a-z_]+)", block, re.IGNORECASE))
        if not tables:
            continue

        allowed: set[str] = set()
        for table in tables:
            allowed |= table_columns.get(table, set())

        # Strip interpolations, string literals, casts and aliases first.
        cleaned = re.sub(r"\$\{[^}]*\}", " ", block)
        cleaned = re.sub(r"'[^']*'", " ", cleaned)
        cleaned = re.sub(r"::\w+", " ", cleaned)
        cleaned = re.sub(r"\bAS\s+\w+", " ", cleaned, flags=re.IGNORECASE)

        for identifier in re.findall(r"\b[a-z][a-z0-9_]{2,}\b", cleaned):
            if identifier in SQL_NOISE or identifier in table_columns:
                continue
            if identifier not in allowed:
                problems.append(
                    f"'{identifier}' is not a column of {sorted(tables)}"
                )

    assert not problems, "Frontend SQL references unknown columns:\n" + "\n".join(
        sorted(set(problems))
    )


def test_every_query_is_valid_postgres(blocks: list[str]) -> None:
    """Parse each query as PostgreSQL.

    The frontend talks to Neon over the wire, so a syntax error would only show
    up at runtime as an empty section. Interpolations are swapped for numbered
    bind parameters first, which is what the driver sends anyway.
    """
    sqlglot = pytest.importorskip("sqlglot", reason="sqlglot is needed to validate SQL")

    failures: list[str] = []
    for block in blocks:
        counter = 0

        def placeholder(_match: re.Match[str]) -> str:
            nonlocal counter
            counter += 1
            return f"${counter}"

        statement = re.sub(r"\$\{[^}]*\}", placeholder, block).strip()
        try:
            parsed = sqlglot.parse_one(statement, dialect="postgres")
            if parsed is None:
                failures.append(f"Parsed to nothing:\n{statement[:200]}")
        except Exception as exc:  # noqa: BLE001 - reported together below
            failures.append(f"{type(exc).__name__}: {exc}\n{statement[:200]}")

    assert not failures, "Invalid PostgreSQL in the frontend:\n\n" + "\n\n".join(failures)


DATE_COLUMNS = (
    "day",
    "pick_date",
    "brief_date",
    "entry_date",
    "event_date",
    "book_closure_from",
    "book_closure_to",
    "announced_on",
)


def test_date_columns_are_never_stringified_directly() -> None:
    """Guard against a regression that broke every /brief/<date> URL.

    Both Postgres drivers return a JavaScript Date for a DATE column, and
    `String(date)` yields "Sat Sep 05 2026 00:00:00 GMT+0500 (Pakistan Standard
    Time)". That was used in hrefs and in the sitemap, producing unreachable
    pages. Dates must go through toIsoDay/maybeIsoDay instead.
    """
    if not DB_TS.exists():
        pytest.skip("frontend/src/lib/db.ts not present")

    source = DB_TS.read_text(encoding="utf-8")
    offenders: list[str] = []

    for column in DATE_COLUMNS:
        # e.g. String(row.brief_date) or String(rows[0].pick_date)
        pattern = re.compile(r"String\(\s*rows?(?:\[\d+\])?\.\s*" + column + r"\s*\)")
        for match in pattern.finditer(source):
            line = source[: match.start()].count("\n") + 1
            offenders.append(f"line {line}: {match.group(0)}")

    assert not offenders, (
        "Date columns must be normalised with toIsoDay(), not String():\n  "
        + "\n  ".join(offenders)
    )


def test_iso_day_helper_exists() -> None:
    """The guard above is only meaningful while the helper is present."""
    if not DB_TS.exists():
        pytest.skip("frontend/src/lib/db.ts not present")
    source = DB_TS.read_text(encoding="utf-8")
    assert "function toIsoDay(" in source, "toIsoDay helper is missing from db.ts"
    assert "maybeIsoDay" in source, "maybeIsoDay helper is missing from db.ts"


def test_pipeline_writes_every_table_the_site_reads(blocks: list[str]) -> None:
    """A table the site reads but nothing ever writes would always look empty."""
    read: set[str] = set()
    for block in blocks:
        read.update(re.findall(r"\bFROM\s+([a-z_]+)", block, re.IGNORECASE))

    written = {
        "stocks", "market_index", "movers", "sector_stats", "corporate_events",
        "payouts", "news_items", "top_picks", "pick_track", "daily_briefs",
        "stock_notes",
    }
    orphans = read - written
    assert not orphans, f"Site reads tables the pipeline never writes: {sorted(orphans)}"
