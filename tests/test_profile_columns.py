"""Profile fields added after launch reach a profiles table that already exists."""

from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import inspect, text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipeline import db  # noqa: E402


def test_existing_profiles_table_gains_name_and_phone(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'profiles.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    db.configure_engine(url)
    with db.get_engine().begin() as conn:
        # The shape that shipped with accounts, before these fields.
        conn.execute(text(
            "CREATE TABLE profiles (user_id VARCHAR(36) PRIMARY KEY, display_name VARCHAR(80), "
            "created_at TIMESTAMP, updated_at TIMESTAMP)"
        ))
        conn.execute(text("INSERT INTO profiles (user_id, display_name) VALUES ('u1', 'Ali Khan')"))

    db.init_db()
    db.init_db()  # a second run finds nothing left to add

    columns = {col["name"] for col in inspect(db.get_engine()).get_columns("profiles")}
    assert {"first_name", "last_name", "phone"} <= columns
    with db.get_engine().connect() as conn:
        row = conn.execute(text("SELECT display_name, first_name, phone FROM profiles")).one()
    assert tuple(row) == ("Ali Khan", "", "")
