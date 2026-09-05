"""Synthetic ETH staking income attribution built from latest canonical exposure."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from src.config.eth_lst_registry import find_eth_lst_asset, normalize_lst_chain
from src.models.yield_returns import (
    MultiWindowYieldSummaryResponse,
    ProtocolYieldBreakdown,
    ProtocolYieldToday,
    ProtocolYieldWindow,
)

ETH_STAKING_PROTOCOL_NAME = "ETH Staking"
_ELIGIBLE_EXPOSURE_TYPES = {"idle", "supply"}


@dataclass(frozen=True)
class EthStakingExposure:
    total_usd: float
    token_symbols: tuple[str, ...]


def aggregate_benchmark_lst_exposure(rows: list[dict[str, Any]]) -> EthStakingExposure:
    """Aggregate only exact registered ``benchmark-rate`` LST representations.

    The SQL reader intentionally emits only idle wallet balances and supply/collateral
    token lists. The explicit side check is a second guard so a future query expansion
    cannot accidentally turn borrowed LSTs into positive staking exposure. Within one
    canonical source row we keep a single economic exposure per chain/address so
    repeated JSON representations cannot double count it.
    """
    exposure_by_identity: dict[tuple[str, str, str, str], float] = {}
    symbols: set[str] = set()

    for row in rows:
        if str(row.get("exposure_type") or "") not in _ELIGIBLE_EXPOSURE_TYPES:
            continue

        chain = normalize_lst_chain(str(row.get("chain") or ""))
        token_address = str(row.get("token_address") or "").strip().lower()
        asset = find_eth_lst_asset(chain, token_address)
        if asset is None or asset.accrual_mode != "benchmark-rate":
            continue

        try:
            amount = float(row.get("amount") or 0.0)
            price = float(row.get("price") or 0.0)
        except (TypeError, ValueError):
            continue
        if amount <= 0.0 or price <= 0.0:
            continue

        source_kind = str(row.get("source_kind") or "unknown")
        source_id = str(row.get("source_id") or "")
        if not source_id:
            continue

        identity = (source_kind, source_id, chain, asset.token_address)
        usd_value = amount * price
        exposure_by_identity[identity] = max(
            exposure_by_identity.get(identity, 0.0), usd_value
        )
        symbols.add(asset.symbol)

    return EthStakingExposure(
        total_usd=sum(exposure_by_identity.values()),
        token_symbols=tuple(sorted(symbols, key=str.lower)),
    )


def with_eth_staking_income(
    summary: MultiWindowYieldSummaryResponse,
    exposure: EthStakingExposure,
    benchmark_apr: float,
) -> MultiWindowYieldSummaryResponse:
    """Append one synthetic ETH Staking source without rewriting observed carry.

    ``benchmark_apr`` is already normalized to a decimal fraction by the provider.
    Existing top-level observed-yield statistics remain untouched; the synthetic row
    is a current run-rate estimate consumed by the Home income model.
    """
    if exposure.total_usd <= 0.0 or benchmark_apr < 0.0:
        return summary

    annual_income_usd = exposure.total_usd * benchmark_apr
    daily_income_usd = annual_income_usd / 365.0
    result = summary.model_copy(deep=True)

    for window in result.windows.values():
        days = window.period.days
        window.protocol_breakdown = [
            item
            for item in window.protocol_breakdown
            if item.protocol != ETH_STAKING_PROTOCOL_NAME
        ]
        window.protocol_breakdown.append(
            ProtocolYieldBreakdown(
                protocol=ETH_STAKING_PROTOCOL_NAME,
                chain=None,
                token_symbols=list(exposure.token_symbols),
                position_types=[],
                window=ProtocolYieldWindow(
                    total_yield_usd=daily_income_usd * days,
                    average_daily_yield_usd=daily_income_usd,
                    data_points=days,
                    positive_days=days if daily_income_usd > 0.0 else 0,
                    negative_days=0,
                ),
                today=ProtocolYieldToday(
                    date=window.period.end_date,
                    yield_usd=daily_income_usd,
                ),
            )
        )

    return result
