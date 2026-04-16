from __future__ import annotations

from collections.abc import Generator
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from src.config.strategy_presets import resolve_seed_strategy_config
from src.models.strategy_config import (
    CreateSavedStrategyConfigRequest,
    UpdateSavedStrategyConfigRequest,
)
from src.services.strategy.strategy_config_management_service import (
    StrategyConfigConflictError,
    StrategyConfigManagementService,
    StrategyConfigNotFoundError,
)
from src.services.strategy.strategy_config_store import StrategyConfigStore
from tests.services.backtesting.support import (
    MOCK_COMPOSED_STRATEGY_ID,
    build_mock_composed_catalog,
    build_mock_saved_config,
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


def _create_request(
    *,
    config_id: str = "dma_custom",
    supports_daily_suggestion: bool = True,
) -> CreateSavedStrategyConfigRequest:
    seed = resolve_seed_strategy_config("dma_gated_fgi_default")
    return CreateSavedStrategyConfigRequest(
        config_id=config_id,
        display_name="DMA Custom",
        description="Custom DMA config",
        strategy_id=seed.strategy_id,
        primary_asset=seed.primary_asset,
        params=dict(seed.params),
        composition=seed.composition.model_copy(deep=True),
        supports_daily_suggestion=supports_daily_suggestion,
    )


def test_create_config_persists_new_live_config(
    db_session: Session,
    allow_write_operations: None,
) -> None:
    _create_strategy_saved_configs_table(db_session)
    service = StrategyConfigManagementService(StrategyConfigStore(db_session))

    stored = service.create_config(_create_request())

    assert stored.config_id == "dma_custom"
    assert stored.is_benchmark is False
    assert stored.is_default is False
    assert service.get_config("dma_custom").composition.signal is not None


def test_create_config_rejects_benchmark_payload(
    db_session: Session,
    allow_write_operations: None,
) -> None:
    _create_strategy_saved_configs_table(db_session)
    service = StrategyConfigManagementService(StrategyConfigStore(db_session))
    benchmark = resolve_seed_strategy_config("dca_classic")
    request = CreateSavedStrategyConfigRequest(
        config_id="new_benchmark",
        display_name="Bad Benchmark",
        strategy_id=benchmark.strategy_id,
        primary_asset=benchmark.primary_asset,
        params=dict(benchmark.params),
        composition=benchmark.composition.model_copy(deep=True),
        supports_daily_suggestion=False,
    )

    with pytest.raises(
        StrategyConfigConflictError, match="Benchmark configs are read-only"
    ):
        service.create_config(request)


def test_update_config_rejects_default_without_daily_suggestion(
    db_session: Session,
    allow_write_operations: None,
) -> None:
    _create_strategy_saved_configs_table(db_session)
    store = StrategyConfigStore(db_session)
    service = StrategyConfigManagementService(store)
    store.upsert_config(
        resolve_seed_strategy_config("dma_gated_fgi_default").model_copy(
            update={"is_default": True}
        )
    )

    with pytest.raises(
        StrategyConfigConflictError,
        match="Default config must support daily suggestion",
    ):
        service.update_config(
            "dma_gated_fgi_default",
            UpdateSavedStrategyConfigRequest(
                display_name="DMA Default",
                description="Updated",
                strategy_id="dma_gated_fgi",
                primary_asset="BTC",
                params=dict(
                    resolve_seed_strategy_config("dma_gated_fgi_default").params
                ),
                composition=resolve_seed_strategy_config(
                    "dma_gated_fgi_default"
                ).composition.model_copy(deep=True),
                supports_daily_suggestion=False,
            ),
        )


def test_set_default_overrides_seed_default_and_preserves_single_default(
    db_session: Session,
    allow_write_operations: None,
) -> None:
    _create_strategy_saved_configs_table(db_session)
    store = StrategyConfigStore(db_session)
    service = StrategyConfigManagementService(store)
    created = service.create_config(_create_request(config_id="dma_alt"))

    promoted = service.set_default(created.config_id)

    assert promoted.config_id == "dma_alt"
    assert promoted.is_default is True
    assert store.resolve_config(None).config_id == "dma_alt"
    configs = {config.config_id: config for config in store.list_configs()}
    assert configs["dma_alt"].is_default is True
    assert configs["dma_gated_fgi_default"].is_default is False


def test_set_default_rejects_config_without_daily_suggestion(
    db_session: Session,
    allow_write_operations: None,
) -> None:
    _create_strategy_saved_configs_table(db_session)
    service = StrategyConfigManagementService(StrategyConfigStore(db_session))
    created = service.create_config(
        _create_request(
            config_id="dma_compare_only",
            supports_daily_suggestion=False,
        )
    )

    with pytest.raises(
        StrategyConfigConflictError,
        match="Default config must support daily suggestion",
    ):
        service.set_default(created.config_id)


def test_get_config_raises_on_missing_config_id(
    db_session: Session,
) -> None:
    _create_strategy_saved_configs_table(db_session)
    service = StrategyConfigManagementService(StrategyConfigStore(db_session))

    with pytest.raises(
        StrategyConfigNotFoundError, match="Unknown config_id 'nonexistent'"
    ):
        service.get_config("nonexistent")


def test_create_config_rejects_duplicate_config_id(
    db_session: Session,
    allow_write_operations: None,
) -> None:
    _create_strategy_saved_configs_table(db_session)
    service = StrategyConfigManagementService(StrategyConfigStore(db_session))
    service.create_config(_create_request(config_id="dma_dup"))

    with pytest.raises(
        StrategyConfigConflictError, match="Config 'dma_dup' already exists"
    ):
        service.create_config(_create_request(config_id="dma_dup"))


def test_set_default_is_noop_when_already_default(
    db_session: Session,
    allow_write_operations: None,
) -> None:
    _create_strategy_saved_configs_table(db_session)
    store = StrategyConfigStore(db_session)
    service = StrategyConfigManagementService(store)
    created = service.create_config(_create_request(config_id="dma_noop"))
    service.set_default(created.config_id)

    result = service.set_default(created.config_id)

    assert result.config_id == "dma_noop"
    assert result.is_default is True


def test_create_config_accepts_registered_mock_family(
    db_session: Session,
    allow_write_operations: None,
) -> None:
    _create_strategy_saved_configs_table(db_session)
    service = StrategyConfigManagementService(
        StrategyConfigStore(db_session),
        composition_catalog=build_mock_composed_catalog(),
    )
    mock_config = build_mock_saved_config(config_id="mock_family_live")

    stored = service.create_config(
        CreateSavedStrategyConfigRequest(
            config_id=mock_config.config_id,
            display_name=mock_config.display_name,
            description=mock_config.description,
            strategy_id=mock_config.strategy_id,
            primary_asset=mock_config.primary_asset,
            params=dict(mock_config.params),
            composition=mock_config.composition.model_copy(deep=True),
            supports_daily_suggestion=mock_config.supports_daily_suggestion,
        )
    )

    assert stored.strategy_id == MOCK_COMPOSED_STRATEGY_ID
    assert stored.is_benchmark is False


def test_update_config_accepts_registered_mock_family(
    db_session: Session,
    allow_write_operations: None,
) -> None:
    _create_strategy_saved_configs_table(db_session)
    service = StrategyConfigManagementService(
        StrategyConfigStore(db_session),
        composition_catalog=build_mock_composed_catalog(),
    )
    mock_config = build_mock_saved_config(config_id="mock_family_live")
    service.create_config(
        CreateSavedStrategyConfigRequest(
            config_id=mock_config.config_id,
            display_name=mock_config.display_name,
            description=mock_config.description,
            strategy_id=mock_config.strategy_id,
            primary_asset=mock_config.primary_asset,
            params=dict(mock_config.params),
            composition=mock_config.composition.model_copy(deep=True),
            supports_daily_suggestion=mock_config.supports_daily_suggestion,
        )
    )

    updated = service.update_config(
        mock_config.config_id,
        UpdateSavedStrategyConfigRequest(
            display_name="Mock Signal Family Updated",
            description="Updated test family",
            strategy_id=mock_config.strategy_id,
            primary_asset=mock_config.primary_asset,
            params=dict(mock_config.params),
            composition=mock_config.composition.model_copy(deep=True),
            supports_daily_suggestion=True,
        ),
    )

    assert updated.strategy_id == MOCK_COMPOSED_STRATEGY_ID
    assert updated.display_name == "Mock Signal Family Updated"


def test_create_config_reports_unknown_family_without_dma_specific_error(
    db_session: Session,
    allow_write_operations: None,
) -> None:
    _create_strategy_saved_configs_table(db_session)
    service = StrategyConfigManagementService(StrategyConfigStore(db_session))
    mock_config = build_mock_saved_config(config_id="unknown_family")

    with pytest.raises(
        ValueError,
        match="Unsupported strategy family 'mock_signal_family'",
    ):
        service.create_config(
            CreateSavedStrategyConfigRequest(
                config_id=mock_config.config_id,
                display_name=mock_config.display_name,
                description=mock_config.description,
                strategy_id=mock_config.strategy_id,
                primary_asset=mock_config.primary_asset,
                params=dict(mock_config.params),
                composition=mock_config.composition.model_copy(deep=True),
                supports_daily_suggestion=mock_config.supports_daily_suggestion,
            )
        )


# ---------------------------------------------------------------------------
# _persist_configs error branches (lines 146, 150, 153-158)
# ---------------------------------------------------------------------------


def test_persist_configs_reraises_strategy_config_conflict_error(
    db_session: Session,
    allow_write_operations: None,
) -> None:
    """Line 146: StrategyConfigConflictError from upsert_configs is re-raised as-is."""
    _create_strategy_saved_configs_table(db_session)
    store = StrategyConfigStore(db_session)
    service = StrategyConfigManagementService(store)

    conflict = StrategyConfigConflictError("already a conflict")
    with patch.object(store, "upsert_configs", side_effect=conflict):
        with pytest.raises(StrategyConfigConflictError, match="already a conflict"):
            service.create_config(_create_request(config_id="dma_persist_test"))


def test_persist_configs_reraises_unrelated_value_error(
    db_session: Session,
    allow_write_operations: None,
) -> None:
    """Line 150: ValueError not containing 'table is not available' is re-raised."""
    _create_strategy_saved_configs_table(db_session)
    store = StrategyConfigStore(db_session)
    service = StrategyConfigManagementService(store)

    unrelated = ValueError("some other validation error")
    with patch.object(store, "upsert_configs", side_effect=unrelated):
        with pytest.raises(ValueError, match="some other validation error"):
            service.create_config(_create_request(config_id="dma_persist_test2"))


def test_persist_configs_wraps_integrity_error_as_conflict(
    db_session: Session,
    allow_write_operations: None,
) -> None:
    """Lines 153-156: IntegrityError is wrapped into StrategyConfigConflictError."""
    _create_strategy_saved_configs_table(db_session)
    store = StrategyConfigStore(db_session)
    service = StrategyConfigManagementService(store)

    integrity_err = IntegrityError("stmt", {}, Exception("unique constraint"))
    with patch.object(store, "upsert_configs", side_effect=integrity_err):
        with pytest.raises(
            StrategyConfigConflictError,
            match="Saved strategy config write conflicted",
        ):
            service.create_config(_create_request(config_id="dma_persist_test3"))


def test_persist_configs_wraps_sqlalchemy_error_as_conflict(
    db_session: Session,
    allow_write_operations: None,
) -> None:
    """Lines 157-160: Generic SQLAlchemyError is wrapped into StrategyConfigConflictError."""
    _create_strategy_saved_configs_table(db_session)
    store = StrategyConfigStore(db_session)
    service = StrategyConfigManagementService(store)

    db_err = SQLAlchemyError("connection lost")
    with patch.object(store, "upsert_configs", side_effect=db_err):
        with pytest.raises(
            StrategyConfigConflictError,
            match="Failed to persist saved strategy config",
        ):
            service.create_config(_create_request(config_id="dma_persist_test4"))
