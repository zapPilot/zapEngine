from __future__ import annotations

from collections.abc import Generator
from datetime import date, datetime
from uuid import UUID

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from src.services.strategy.strategy_trade_history_store import (
    SeedStrategyTradeHistoryStore,
    StrategyTradeHistoryStore,
    _coerce_trade_date,
)


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    engine = create_engine("sqlite:///:memory:")
    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = session_factory()
    yield session
    session.close()
    engine.dispose()


def _create_strategy_trade_history_table(session: Session) -> None:
    session.execute(
        text(
            """
            CREATE TABLE strategy_trade_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                trade_date TEXT NOT NULL,
                strategy_id TEXT,
                config_id TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
    )
    session.commit()


def test_trade_history_store_returns_empty_when_table_missing(
    db_session: Session,
) -> None:
    store = StrategyTradeHistoryStore(db_session)
    assert store.list_trade_dates(UUID(int=1)) == []


def test_trade_history_store_lists_dates_with_filters(db_session: Session) -> None:
    _create_strategy_trade_history_table(db_session)
    db_session.execute(
        text(
            """
            INSERT INTO strategy_trade_history (user_id, trade_date, strategy_id)
            VALUES
                (:user_id, :trade_date_1, 'dma_gated_fgi'),
                (:user_id, :trade_date_2, 'dma_fgi_portfolio_rules'),
                (:other_user_id, :trade_date_3, 'dma_gated_fgi')
            """
        ),
        {
            "user_id": str(UUID(int=1)),
            "other_user_id": str(UUID(int=2)),
            "trade_date_1": "2025-01-03",
            "trade_date_2": "2025-01-10",
            "trade_date_3": "2025-01-08",
        },
    )
    db_session.commit()

    store = StrategyTradeHistoryStore(db_session)
    assert store.list_trade_dates(UUID(int=1)) == [
        date(2025, 1, 3),
        date(2025, 1, 10),
    ]
    assert store.list_trade_dates(
        UUID(int=1),
        start_date=date(2025, 1, 4),
        end_date=date(2025, 1, 10),
    ) == [date(2025, 1, 10)]


def test_seed_trade_history_store_returns_empty_list() -> None:
    store = SeedStrategyTradeHistoryStore()
    assert store.list_trade_dates(UUID(int=1)) == []


@pytest.mark.parametrize(
    "value",
    [datetime(2025, 1, 3, 12, 30), "2025-01-03T12:30:00Z"],
)
def test_coerce_trade_date_preserves_datetime_inputs(value: object) -> None:
    assert _coerce_trade_date(value) == date(2025, 1, 3)


def test_coerce_trade_date_preserves_error_wrapper() -> None:
    with pytest.raises(ValueError, match="Unsupported trade_date value"):
        _coerce_trade_date(object())
