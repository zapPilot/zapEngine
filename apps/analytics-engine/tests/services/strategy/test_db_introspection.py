from __future__ import annotations

from collections.abc import Generator

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from src.services.strategy._db_introspection import table_exists


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    engine = create_engine("sqlite:///:memory:")
    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = session_factory()
    yield session
    session.close()
    engine.dispose()


def test_table_exists_detects_present_and_missing_tables(
    db_session: Session,
) -> None:
    db_session.execute(
        text("CREATE TABLE strategy_saved_configs (id TEXT PRIMARY KEY)")
    )

    assert table_exists(db_session, "strategy_saved_configs") is True
    assert table_exists(db_session, "strategy_trade_history") is False


def test_table_exists_returns_false_when_inspection_fails(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _bad_get_bind() -> object:
        raise SQLAlchemyError("connection broken")

    monkeypatch.setattr(db_session, "get_bind", _bad_get_bind)

    assert table_exists(db_session, "strategy_saved_configs") is False
