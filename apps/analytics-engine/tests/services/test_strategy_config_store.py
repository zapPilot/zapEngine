from __future__ import annotations

from collections.abc import Generator

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from src.config.strategy_presets import resolve_seed_strategy_config
from src.services.strategy.strategy_config_store import (
    SeedStrategyConfigStore,
    StrategyConfigStore,
    _deserialize_json,
)


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    engine = create_engine("sqlite:///:memory:")
    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = session_factory()
    yield session
    session.close()
    engine.dispose()


def _create_strategy_saved_configs_table(session: Session) -> None:
    session.execute(
        text(
            """
            CREATE TABLE strategy_saved_configs (
                config_id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                description TEXT,
                strategy_id TEXT NOT NULL,
                primary_asset TEXT NOT NULL,
                params TEXT NOT NULL,
                composition TEXT NOT NULL,
                supports_daily_suggestion BOOLEAN NOT NULL,
                is_default BOOLEAN NOT NULL,
                is_benchmark BOOLEAN NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
    )
    session.execute(
        text(
            """
            CREATE UNIQUE INDEX strategy_saved_configs_single_default_idx
            ON strategy_saved_configs (is_default)
            WHERE is_default
            """
        )
    )
    session.commit()


def test_list_configs_falls_back_to_seed_configs_when_table_missing(
    db_session: Session,
) -> None:
    store = StrategyConfigStore(db_session)

    configs = store.list_configs()

    assert [config.config_id for config in configs] == [
        "dma_fgi_portfolio_rules_default",
        "dca_classic",
        "fixed_interval_balanced_30d",
        "fixed_interval_conservative_30d",
        "fixed_interval_aggressive_90d",
    ]
    assert store.resolve_config(None).config_id == "dma_fgi_portfolio_rules_default"


def test_upsert_and_resolve_saved_config_round_trip(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _create_strategy_saved_configs_table(db_session)
    store = StrategyConfigStore(db_session)
    monkeypatch.setattr(
        "src.services.strategy.strategy_config_store.validate_write_operation",
        lambda: None,
    )
    config = resolve_seed_strategy_config("dma_fgi_portfolio_rules_default").model_copy(
        update={
            "config_id": "dma_fgi_portfolio_rules_custom",
            "display_name": "ETH/BTC Custom",
            "is_default": False,
        }
    )

    stored = store.upsert_config(config)

    assert stored.config_id == "dma_fgi_portfolio_rules_custom"
    assert stored.display_name == "ETH/BTC Custom"
    assert (
        store.resolve_config("dma_fgi_portfolio_rules_custom").composition.signal
        is not None
    )


def test_upsert_configs_can_flip_default_without_duplicate_defaults(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _create_strategy_saved_configs_table(db_session)
    store = StrategyConfigStore(db_session)
    monkeypatch.setattr(
        "src.services.strategy.strategy_config_store.validate_write_operation",
        lambda: None,
    )
    original_default = resolve_seed_strategy_config("dma_fgi_portfolio_rules_default")
    alternate = original_default.model_copy(
        update={
            "config_id": "portfolio_rules_alt",
            "display_name": "Portfolio Rules Alt",
            "is_default": False,
        }
    )
    store.upsert_configs(
        [
            original_default.model_copy(update={"is_default": False}),
            alternate.model_copy(update={"is_default": True}),
        ]
    )

    assert store.resolve_config(None).config_id == "portfolio_rules_alt"
    assert store.get_config("dma_fgi_portfolio_rules_default") is not None


def test_resolve_config_raises_on_unknown_config_id(
    db_session: Session,
) -> None:
    store = StrategyConfigStore(db_session)

    with pytest.raises(ValueError, match="Unknown config_id 'nonexistent'"):
        store.resolve_config("nonexistent")


def test_deserialize_json_passthrough_dict() -> None:
    result = _deserialize_json({"key": "value"})
    assert result == {"key": "value"}


def test_deserialize_json_rejects_non_dict_string() -> None:
    with pytest.raises(ValueError, match="Expected JSON object payload"):
        _deserialize_json("[1, 2, 3]")


def test_deserialize_json_rejects_non_string_non_dict() -> None:
    with pytest.raises(ValueError, match="Expected JSON object payload"):
        _deserialize_json(42)


# ---------------------------------------------------------------------------
# SeedStrategyConfigStore
# ---------------------------------------------------------------------------


def test_seed_store_list_configs_returns_all_seeds() -> None:
    store = SeedStrategyConfigStore()
    configs = store.list_configs()

    config_ids = [config.config_id for config in configs]
    assert config_ids == [
        "dma_fgi_portfolio_rules_default",
        "dca_classic",
        "fixed_interval_balanced_30d",
        "fixed_interval_conservative_30d",
        "fixed_interval_aggressive_90d",
    ]


def test_seed_store_resolve_config_default() -> None:
    store = SeedStrategyConfigStore()
    config = store.resolve_config(None)
    assert config.config_id == "dma_fgi_portfolio_rules_default"


def test_seed_store_resolve_config_by_id() -> None:
    store = SeedStrategyConfigStore()
    config = store.resolve_config("dma_fgi_portfolio_rules_default")
    assert config.config_id == "dma_fgi_portfolio_rules_default"


def test_seed_store_resolve_config_unknown_raises() -> None:
    store = SeedStrategyConfigStore()
    with pytest.raises(ValueError, match="Unknown config_id 'nonexistent'"):
        store.resolve_config("nonexistent")


def test_seed_store_get_config_found() -> None:
    store = SeedStrategyConfigStore()
    config = store.get_config("dma_fgi_portfolio_rules_default")
    assert config is not None
    assert config.config_id == "dma_fgi_portfolio_rules_default"


def test_seed_store_get_config_missing_returns_none() -> None:
    store = SeedStrategyConfigStore()
    assert store.get_config("nonexistent") is None


def test_resolve_config_falls_back_to_seed_default_when_no_db_default(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Line 66: resolve_config falls back to get_default_seed_strategy_config
    when no config in the list has is_default=True."""
    _create_strategy_saved_configs_table(db_session)
    store = StrategyConfigStore(db_session)
    monkeypatch.setattr(
        "src.services.strategy.strategy_config_store.validate_write_operation",
        lambda: None,
    )
    # Upsert a non-default config only
    config = resolve_seed_strategy_config("dma_fgi_portfolio_rules_default").model_copy(
        update={
            "config_id": "only_non_default",
            "display_name": "Non-Default",
            "is_default": False,
        }
    )
    store.upsert_config(config)

    # Monkeypatch list_seed_strategy_configs to return only non-default seeds
    from src.config import strategy_presets as sp_module

    non_default_seeds = [
        c.model_copy(update={"is_default": False})
        for c in sp_module.SEED_STRATEGY_CONFIGS
    ]
    monkeypatch.setattr(
        "src.services.strategy.strategy_config_store.list_seed_strategy_configs",
        lambda: non_default_seeds,
    )

    # resolve_config(None) should fall through to get_default_seed_strategy_config
    # which still reads from the real SEED_STRATEGY_CONFIGS
    result = store.resolve_config(None)
    assert result.config_id == "dma_fgi_portfolio_rules_default"


def test_table_exists_returns_false_on_sqlalchemy_error(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Lines 157-158: _table_exists catches SQLAlchemyError and returns False."""
    from sqlalchemy.exc import SQLAlchemyError

    store = StrategyConfigStore(db_session)

    def _bad_get_bind():
        raise SQLAlchemyError("connection broken")

    monkeypatch.setattr(db_session, "get_bind", _bad_get_bind)
    assert store._table_exists() is False
