"""Admin management service for global saved strategy configs."""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from src.models.strategy_config import (
    CreateSavedStrategyConfigRequest,
    SavedStrategyConfig,
    UpdateSavedStrategyConfigRequest,
)
from src.services.backtesting.composition import resolve_saved_strategy_config
from src.services.backtesting.composition_catalog import (
    CompositionCatalog,
    get_default_composition_catalog,
)
from src.services.strategy.strategy_config_store import StrategyConfigStore


class StrategyConfigNotFoundError(LookupError):
    """Raised when an admin config lookup misses."""


class StrategyConfigConflictError(RuntimeError):
    """Raised when a config mutation violates management rules."""


class StrategyConfigManagementService:
    """Apply admin-only write rules on top of the saved-config store."""

    def __init__(
        self,
        strategy_config_store: StrategyConfigStore,
        composition_catalog: CompositionCatalog | None = None,
    ):
        self.strategy_config_store = strategy_config_store
        self.composition_catalog = (
            composition_catalog or get_default_composition_catalog()
        )

    def list_configs(self) -> list[SavedStrategyConfig]:
        return self.strategy_config_store.list_configs()

    def get_config(self, config_id: str) -> SavedStrategyConfig:
        config = self.strategy_config_store.get_config(config_id)
        if config is None:
            raise StrategyConfigNotFoundError(f"Unknown config_id '{config_id}'")
        return config

    def create_config(
        self,
        request: CreateSavedStrategyConfigRequest,
    ) -> SavedStrategyConfig:
        if self.strategy_config_store.get_config(request.config_id) is not None:
            raise StrategyConfigConflictError(
                f"Config '{request.config_id}' already exists"
            )
        config = SavedStrategyConfig(
            config_id=request.config_id,
            display_name=request.display_name,
            description=request.description,
            strategy_id=request.strategy_id,
            primary_asset=request.primary_asset,
            params=dict(request.params),
            composition=request.composition,
            supports_daily_suggestion=request.supports_daily_suggestion,
            is_default=False,
            is_benchmark=False,
        )
        self._validate_mutable_config(config)
        return self._persist_configs([config])[0]

    def update_config(
        self,
        config_id: str,
        request: UpdateSavedStrategyConfigRequest,
    ) -> SavedStrategyConfig:
        existing = self.get_config(config_id)
        self._ensure_non_benchmark(existing)
        updated = SavedStrategyConfig(
            config_id=existing.config_id,
            display_name=request.display_name,
            description=request.description,
            strategy_id=request.strategy_id,
            primary_asset=request.primary_asset,
            params=dict(request.params),
            composition=request.composition,
            supports_daily_suggestion=request.supports_daily_suggestion,
            is_default=existing.is_default,
            is_benchmark=False,
        )
        self._validate_mutable_config(updated)
        if updated.is_default and not updated.supports_daily_suggestion:
            raise StrategyConfigConflictError(
                "Default config must support daily suggestion"
            )
        return self._persist_configs([updated])[0]

    def set_default(self, config_id: str) -> SavedStrategyConfig:
        target = self.get_config(config_id)
        self._ensure_non_benchmark(target)
        if not target.supports_daily_suggestion:
            raise StrategyConfigConflictError(
                "Default config must support daily suggestion"
            )
        if target.is_default:
            return target

        updates: list[SavedStrategyConfig] = []
        for config in self.strategy_config_store.list_configs():
            if config.is_benchmark:
                continue
            if config.config_id == target.config_id:
                continue
            if config.is_default:
                updates.append(
                    config.model_copy(update={"is_default": False}, deep=True)
                )
        updates.append(target.model_copy(update={"is_default": True}, deep=True))
        return self._persist_configs(updates)[-1]

    def _validate_mutable_config(self, config: SavedStrategyConfig) -> None:
        family = self.composition_catalog.resolve_family(config.strategy_id)
        if not family.mutable_via_admin:
            raise StrategyConfigConflictError(
                "Benchmark configs are read-only and cannot be managed via the admin API"
            )
        resolve_saved_strategy_config(config, catalog=self.composition_catalog)

    @staticmethod
    def _ensure_non_benchmark(config: SavedStrategyConfig) -> None:
        if config.is_benchmark or config.composition.kind == "benchmark":
            raise StrategyConfigConflictError(
                f"Benchmark config '{config.config_id}' is read-only"
            )

    def _persist_configs(
        self,
        configs: Sequence[SavedStrategyConfig],
    ) -> list[SavedStrategyConfig]:
        try:
            return self.strategy_config_store.upsert_configs(configs)
        except StrategyConfigConflictError:
            raise
        except ValueError as error:
            if "table is not available" in str(error):
                raise StrategyConfigConflictError(str(error)) from error
            raise
        except RuntimeError as error:
            raise StrategyConfigConflictError(str(error)) from error
        except IntegrityError as error:
            raise StrategyConfigConflictError(
                "Saved strategy config write conflicted with an existing default state"
            ) from error
        except SQLAlchemyError as error:
            raise StrategyConfigConflictError(
                "Failed to persist saved strategy config"
            ) from error


__all__ = [
    "StrategyConfigConflictError",
    "StrategyConfigManagementService",
    "StrategyConfigNotFoundError",
]
