"""Saved-config source: the code-owned seeds, and nothing else.

There is no database overlay. A saved config is a code change reviewed in a PR,
so what the backtest, the snapshot and the live suggestion run is always what
the repository says, never a row someone edited in production.
"""

from __future__ import annotations

from collections.abc import Iterable

from src.config.strategy_presets import (
    get_default_seed_strategy_config,
    list_seed_strategy_configs,
)
from src.models.strategy_config import SavedStrategyConfig


def _find_config(
    configs: Iterable[SavedStrategyConfig],
    config_id: str,
) -> SavedStrategyConfig | None:
    target_id = str(config_id).strip()
    for config in configs:
        if config.config_id == target_id:
            return config
    return None


def _valid_config_ids(configs: Iterable[SavedStrategyConfig]) -> str:
    return ", ".join(sorted(config.config_id for config in configs))


class StrategyConfigStore:
    """Read-only saved-config source shared by compare and daily suggestion."""

    def list_configs(self) -> list[SavedStrategyConfig]:
        return list_seed_strategy_configs()

    def resolve_config(self, config_id: str | None) -> SavedStrategyConfig:
        if config_id is None or not str(config_id).strip():
            return get_default_seed_strategy_config()
        configs = self.list_configs()
        resolved = _find_config(configs, config_id)
        if resolved is not None:
            return resolved
        valid = _valid_config_ids(configs)
        raise ValueError(
            f"Unknown config_id '{str(config_id).strip()}'. Valid values: {valid}"
        )

    def get_config(self, config_id: str) -> SavedStrategyConfig | None:
        return _find_config(self.list_configs(), config_id)


__all__ = ["StrategyConfigStore"]
