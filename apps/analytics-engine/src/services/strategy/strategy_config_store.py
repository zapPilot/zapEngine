"""DB-backed store for saved strategy configs with seed bootstrap fallback."""

from __future__ import annotations

import json
from collections.abc import Iterable
from typing import Any

from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from src.config.strategy_presets import (
    get_default_seed_strategy_config,
    list_seed_strategy_configs,
)
from src.core.database import validate_write_operation
from src.models.strategy_config import SavedStrategyConfig

_TABLE_NAME = "strategy_saved_configs"


def _serialize_json(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), sort_keys=True)


def _deserialize_json(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        decoded = json.loads(value)
        if isinstance(decoded, dict):
            return decoded
    raise ValueError("Expected JSON object payload for saved strategy config")


class StrategyConfigStore:
    """Persistent saved-config source for compare and daily suggestion."""

    def __init__(self, db: Session):
        self.db = db

    def list_configs(self) -> list[SavedStrategyConfig]:
        if not self._table_exists():
            return list_seed_strategy_configs()
        merged: dict[str, SavedStrategyConfig] = {
            config.config_id: config for config in list_seed_strategy_configs()
        }
        for config in self._load_rows():
            merged[config.config_id] = config
        return sorted(
            merged.values(),
            key=lambda config: (
                config.is_benchmark,
                not config.is_default,
                config.config_id,
            ),
        )

    def resolve_config(self, config_id: str | None) -> SavedStrategyConfig:
        if config_id is None or not str(config_id).strip():
            configs = self.list_configs()
            for config in configs:
                if config.is_default:
                    return config
            return get_default_seed_strategy_config()

        target_id = str(config_id).strip()
        resolved = self.get_config(target_id)
        if resolved is not None:
            return resolved
        valid = ", ".join(sorted(config.config_id for config in self.list_configs()))
        raise ValueError(f"Unknown config_id '{target_id}'. Valid values: {valid}")

    def get_config(self, config_id: str) -> SavedStrategyConfig | None:
        target_id = str(config_id).strip()
        for config in self.list_configs():
            if config.config_id == target_id:
                return config
        return None

    def upsert_config(self, config: SavedStrategyConfig) -> SavedStrategyConfig:
        return self.upsert_configs([config])[0]

    def upsert_configs(
        self,
        configs: Iterable[SavedStrategyConfig],
    ) -> list[SavedStrategyConfig]:
        validate_write_operation()
        if not self._table_exists():
            raise ValueError(
                "strategy_saved_configs table is not available; apply migrations first"
            )
        persisted_ids: list[str] = []
        for config in configs:
            payload = config.model_dump(mode="json")
            self.db.execute(
                text(
                    """
                    INSERT INTO strategy_saved_configs (
                        config_id,
                        display_name,
                        description,
                        strategy_id,
                        primary_asset,
                        params,
                        composition,
                        supports_daily_suggestion,
                        is_default,
                        is_benchmark
                    ) VALUES (
                        :config_id,
                        :display_name,
                        :description,
                        :strategy_id,
                        :primary_asset,
                        :params,
                        :composition,
                        :supports_daily_suggestion,
                        :is_default,
                        :is_benchmark
                    )
                    ON CONFLICT (config_id) DO UPDATE SET
                        display_name = excluded.display_name,
                        description = excluded.description,
                        strategy_id = excluded.strategy_id,
                        primary_asset = excluded.primary_asset,
                        params = excluded.params,
                        composition = excluded.composition,
                        supports_daily_suggestion = excluded.supports_daily_suggestion,
                        is_default = excluded.is_default,
                        is_benchmark = excluded.is_benchmark,
                        updated_at = CURRENT_TIMESTAMP
                    """
                ),
                {
                    "config_id": payload["config_id"],
                    "display_name": payload["display_name"],
                    "description": payload["description"],
                    "strategy_id": payload["strategy_id"],
                    "primary_asset": payload["primary_asset"],
                    "params": _serialize_json(payload["params"]),
                    "composition": _serialize_json(payload["composition"]),
                    "supports_daily_suggestion": payload["supports_daily_suggestion"],
                    "is_default": payload["is_default"],
                    "is_benchmark": payload["is_benchmark"],
                },
            )
            persisted_ids.append(config.config_id)
        self.db.commit()
        return [self.resolve_config(config_id) for config_id in persisted_ids]

    def _table_exists(self) -> bool:
        try:
            bind = self.db.get_bind()
            return bool(inspect(bind).has_table(_TABLE_NAME))
        except SQLAlchemyError:
            return False

    def _load_rows(self) -> Iterable[SavedStrategyConfig]:
        rows = self.db.execute(
            text(
                """
                SELECT
                    config_id,
                    display_name,
                    description,
                    strategy_id,
                    primary_asset,
                    params,
                    composition,
                    supports_daily_suggestion,
                    is_default,
                    is_benchmark
                FROM strategy_saved_configs
                """
            )
        ).mappings()
        for row in rows:
            yield SavedStrategyConfig.model_validate(
                {
                    "config_id": row["config_id"],
                    "display_name": row["display_name"],
                    "description": row["description"],
                    "strategy_id": row["strategy_id"],
                    "primary_asset": row["primary_asset"],
                    "params": _deserialize_json(row["params"]),
                    "composition": _deserialize_json(row["composition"]),
                    "supports_daily_suggestion": row["supports_daily_suggestion"],
                    "is_default": row["is_default"],
                    "is_benchmark": row["is_benchmark"],
                }
            )


class SeedStrategyConfigStore:
    """Static saved-config store backed only by bootstrap seeds."""

    def list_configs(self) -> list[SavedStrategyConfig]:
        return list_seed_strategy_configs()

    def resolve_config(self, config_id: str | None) -> SavedStrategyConfig:
        if config_id is None or not str(config_id).strip():
            return get_default_seed_strategy_config()
        target_id = str(config_id).strip()
        for config in list_seed_strategy_configs():
            if config.config_id == target_id:
                return config
        valid = ", ".join(
            sorted(config.config_id for config in list_seed_strategy_configs())
        )
        raise ValueError(f"Unknown config_id '{target_id}'. Valid values: {valid}")

    def get_config(self, config_id: str) -> SavedStrategyConfig | None:
        target_id = str(config_id).strip()
        for config in list_seed_strategy_configs():
            if config.config_id == target_id:
                return config
        return None


__all__ = ["SeedStrategyConfigStore", "StrategyConfigStore"]
