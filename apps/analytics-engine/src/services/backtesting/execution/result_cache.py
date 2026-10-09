"""Bounded compare-result cache keyed by normalized inputs and market history."""

from __future__ import annotations

import hashlib
import json
import pickle
from collections.abc import Callable
from dataclasses import asdict
from datetime import date, timedelta
from typing import Any, cast

from src.core.cache_service import CacheService
from src.core.config import settings
from src.models.backtesting import (
    BacktestCompareRequestV3,
    BacktestResponse,
    BacktestWindowInfo,
)
from src.services.backtesting.composition import ResolvedSavedStrategyConfig
from src.services.backtesting.execution.config import RegimeConfig

COMPARE_RESULT_TTL = timedelta(hours=1)
# The app's 500-day, two-config compare is ~10 MiB as a live response graph but
# ~1.4 MiB pickled. 16 entries capped at 4 MiB hold the cache to 64 MiB, which
# the 512 MB production machine can afford; larger results are simply recomputed.
COMPARE_RESULT_MAX_ENTRIES = 16
COMPARE_RESULT_MAX_ENTRY_BYTES = 4 * 1024 * 1024


class CompareResultCache:
    """Process-wide cache of compare responses, stored as immutable pickles.

    Every caller (hit, miss, or single-flight follower) unpickles its own copy,
    so nothing a caller does to a response can reach the cache or another caller.
    The bytes are produced and read only inside this process.
    """

    def __init__(
        self,
        *,
        ttl: timedelta = COMPARE_RESULT_TTL,
        max_entries: int = COMPARE_RESULT_MAX_ENTRIES,
        max_entry_bytes: int = COMPARE_RESULT_MAX_ENTRY_BYTES,
    ) -> None:
        self._snapshots = CacheService(default_ttl=ttl, max_entries=max_entries)
        self._max_entry_bytes = max_entry_bytes

    def get_or_compute(
        self, key: str, compute: Callable[[], BacktestResponse]
    ) -> BacktestResponse:
        if not settings.analytics_cache_enabled:
            return compute()
        snapshot = self._snapshots.get_or_compute(
            key,
            lambda: pickle.dumps(compute(), protocol=pickle.HIGHEST_PROTOCOL),
            should_cache=lambda blob: len(blob) <= self._max_entry_bytes,
        )
        return cast(BacktestResponse, pickle.loads(snapshot))

    def clear(self) -> None:
        self._snapshots.clear()


# FastAPI services are request-scoped; the cache must outlive their DB sessions.
compare_results = CompareResultCache()


def compare_result_key(
    request: BacktestCompareRequestV3,
    resolved_configs: list[ResolvedSavedStrategyConfig],
    prices: list[dict[str, Any]],
    sentiments: dict[date, Any],
    window: BacktestWindowInfo,
    config: RegimeConfig | None,
) -> str:
    normalized = request.model_dump(
        mode="json",
        # Dates are keyed through ``window`` and configs in resolved form below.
        exclude={
            "start_date",
            "end_date",
            "days",
            "configs",
        },
    )
    normalized["configs"] = [
        {
            "config_id": item.request_config_id,
            "strategy_id": item.strategy_id,
            "params": item.public_params,
            "composition": item.cache_identity,
            "display_name": item.display_name,
            "primary_asset": item.primary_asset,
            "signal_id": item.summary_signal_id,
            "runtime_mode": item.runtime_portfolio_mode,
        }
        for item in resolved_configs
    ]
    payload = {
        "request": normalized,
        "data_date": window.effective.end_date.isoformat(),
        "window": window.model_dump(mode="json"),
        # Detect corrections delivered on the same data date as well as rollover.
        "prices": prices,
        "sentiments": [
            (day.isoformat(), value) for day, value in sorted(sentiments.items())
        ],
        "engine": asdict(config or RegimeConfig.default()),
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return "backtesting:compare:v1:" + hashlib.sha256(encoded.encode()).hexdigest()
