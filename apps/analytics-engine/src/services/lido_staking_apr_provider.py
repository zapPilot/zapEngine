"""Narrow Lido staking APR benchmark provider.

Lido reports the 7-day SMA as a percentage value (for example ``2.5`` means
2.5%). This provider normalizes it to a decimal fraction (``0.025``) before it
leaves the boundary.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

import httpx

from src.core.cache_service import analytics_cache

logger = logging.getLogger(__name__)

LIDO_STAKING_APR_URL = "https://eth-api.lido.fi/v1/protocol/steth/apr/sma"
_FRESH_CACHE_TTL = timedelta(hours=6)
_STALE_CACHE_TTL = timedelta(days=30)
_FRESH_CACHE_KEY = analytics_cache.build_key("LidoStakingApr", "7d-sma", "fresh")
_STALE_CACHE_KEY = analytics_cache.build_key(
    "LidoStakingApr", "7d-sma", "last-success"
)


class LidoStakingAprProvider:
    """Fetch and cache Lido's official 7-day SMA staking APR benchmark."""

    def __init__(self, *, timeout_seconds: float = 5.0) -> None:
        self._timeout_seconds = timeout_seconds

    async def get_benchmark_apr(self) -> float | None:
        """Return APR as a decimal fraction, or ``None`` if no valid value exists."""
        fresh = analytics_cache.get(_FRESH_CACHE_KEY)
        if isinstance(fresh, int | float):
            return float(fresh)

        try:
            normalized_apr = await self._fetch_live_apr()
        except Exception as error:  # The income endpoint must degrade gracefully.
            logger.warning("Lido staking APR fetch failed: %s", error)
            stale = analytics_cache.get(_STALE_CACHE_KEY)
            return float(stale) if isinstance(stale, int | float) else None

        analytics_cache.set(_FRESH_CACHE_KEY, normalized_apr, _FRESH_CACHE_TTL)
        analytics_cache.set(_STALE_CACHE_KEY, normalized_apr, _STALE_CACHE_TTL)
        return normalized_apr

    async def _fetch_live_apr(self) -> float:
        async with httpx.AsyncClient(
            timeout=self._timeout_seconds,
            headers={"User-Agent": "zap-engine-analytics/eth-staking-income"},
        ) as client:
            response = await client.get(LIDO_STAKING_APR_URL)
            response.raise_for_status()
            return self._parse_apr(response.json())

    @staticmethod
    def _parse_apr(payload: dict[str, Any]) -> float:
        raw_apr = payload.get("data", {}).get("smaApr")
        if isinstance(raw_apr, bool) or not isinstance(raw_apr, int | float):
            raise ValueError("Lido response is missing numeric data.smaApr")

        percent_apr = float(raw_apr)
        if percent_apr < 0.0 or percent_apr > 100.0:
            raise ValueError(f"Lido APR percentage out of range: {percent_apr}")

        # Lido returns percentage points: 2.5 == 2.5%, not 250% or 0.025%.
        return percent_apr / 100.0
