"""SQLAlchemy 2 engine/session. SQLite uses BEGIN IMMEDIATE so credit deductions serialise.

Schema is created with create_all at startup (no alembic): the schema is small and the hackathon
database is disposable. Recorded in DECISIONS.md.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from sqlalchemy import Engine, create_engine, event, inspect
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


def make_engine(url: str) -> Engine:
    is_sqlite = url.startswith("sqlite")
    if is_sqlite and ":memory:" not in url:
        path = url.split("///", 1)[-1]
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        url,
        connect_args={"check_same_thread": False, "timeout": 15} if is_sqlite else {},
        pool_pre_ping=True,
    )
    if is_sqlite:

        @event.listens_for(engine, "connect")
        def _on_connect(dbapi_conn: Any, _: Any) -> None:
            dbapi_conn.isolation_level = None  # let us emit BEGIN ourselves
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA busy_timeout=15000")
            cur.close()

        @event.listens_for(engine, "begin")
        def _on_begin(conn: Any) -> None:
            conn.exec_driver_sql("BEGIN IMMEDIATE")

    return engine


class Database:
    def __init__(self, url: str) -> None:
        self.engine = make_engine(url)
        self.sessionmaker = sessionmaker(self.engine, expire_on_commit=False)

    def create_all(self) -> None:
        from app.db import models  # noqa: F401  (register tables)

        Base.metadata.create_all(self.engine)
        self._add_missing_nullable_columns()

    def _add_missing_nullable_columns(self) -> None:
        """Tiny additive migration: create_all never alters existing tables, so a database created by
        an older version would miss newer nullable columns. Only nullable additions are handled."""
        with self.engine.begin() as conn:
            insp = inspect(conn)  # same connection: a second one would wait on our BEGIN IMMEDIATE
            for table in Base.metadata.sorted_tables:
                if not insp.has_table(table.name):
                    continue
                existing = {c["name"] for c in insp.get_columns(table.name)}
                for col in table.columns:
                    if col.name not in existing and col.nullable:
                        ddl = col.type.compile(dialect=self.engine.dialect)
                        conn.exec_driver_sql(f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {ddl}')

    @contextmanager
    def session(self) -> Iterator[Session]:
        """One transaction: commits on success, rolls back on error."""
        with self.sessionmaker() as s, s.begin():
            yield s
