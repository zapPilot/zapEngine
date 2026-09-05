"""Focused business-rule tests for synthetic ETH staking income attribution."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest

from src.config.eth_lst_registry import ETH_LST_ASSETS
from src.core.cache_service import analytics_cache
from src.services.aggregators.yield_summary_builder import build_yield_summary
from src.services.analytics.analytics_context import PortfolioAnalyticsContext
from src.services.eth_staking_income import (
    ETH_STAKING_PROTOCOL_NAME,
    aggregate_benchmark_lst_exposure,
    with_eth_staking_income,
)
from src.services import lido_staking_apr_provider as lido_module
from src.services.lido_staking_apr_provider import LidoStakingAprProvider
from src.services.yield_return_service import YieldReturnService


def _address(symbol: str, chain: str = "eth") -> str:
    return next(
        asset.token_address
        for asset in ETH_LST_ASSETS
        if asset.symbol == symbol and asset.chain == chain
    )


def _exposure_row(
    symbol: str,
    *,
    amount: float,
    price: float,
    chain: str = "eth",
    exposure_type: str = "supply",
    source_kind: str = "position",
    source_id: str = "position-1",
    token_address: str | None = None,
) -> dict[str, Any]:
    return {
        "chain": chain,
        "token_address": token_address or _address(symbol, chain),
        "symbol": symbol,
        "amount": amount,
        "price": price,
        "exposure_type": exposure_type,
        "source_kind": source_kind,
        "source_id": source_id,
    }


def test_non_rebasing_wsteth_collateral_contributes_benchmark_exposure():
    exposure = aggregate_benchmark_lst_exposure(
        [_exposure_row("wstETH", amount=2.0, price=3_000.0)]
    )

    assert exposure.total_usd == pytest.approx(6_000.0)
    assert exposure.token_symbols == ("wstETH",)


def test_idle_lst_holdings_contribute_staking_exposure():
    exposure = aggregate_benchmark_lst_exposure(
        [
            _exposure_row(
                "wstETH",
                amount=1.0,
                price=3_000.0,
                exposure_type="idle",
                source_kind="idle",
                source_id="wallet-1",
            ),
            _exposure_row(
                "cbETH",
                amount=2.0,
                price=2_900.0,
                exposure_type="idle",
                source_kind="idle",
                source_id="wallet-1",
            ),
        ]
    )

    assert exposure.total_usd == pytest.approx(8_800.0)
    assert exposure.token_symbols == ("cbETH", "wstETH")


def test_rebasing_steth_does_not_receive_benchmark_income():
    exposure = aggregate_benchmark_lst_exposure(
        [_exposure_row("stETH", amount=2.0, price=2_500.0)]
    )

    assert exposure.total_usd == 0.0
    assert exposure.token_symbols == ()


def test_borrowed_lst_is_not_positive_staking_exposure():
    exposure = aggregate_benchmark_lst_exposure(
        [
            _exposure_row(
                "wstETH",
                amount=2.0,
                price=3_000.0,
                exposure_type="borrow",
            )
        ]
    )

    assert exposure.total_usd == 0.0


def test_derivative_symbol_does_not_match_direct_lst_by_substring():
    exposure = aggregate_benchmark_lst_exposure(
        [
            _exposure_row(
                "wstETH",
                amount=4.0,
                price=2_000.0,
                token_address="0x00000000000000000000000000000000000000aa",
            )
            | {"symbol": "PT-wstETH-26DEC2026"}
        ]
    )

    assert exposure.total_usd == 0.0


def test_duplicate_representation_inside_one_source_is_not_double_counted():
    row = _exposure_row("wstETH", amount=2.0, price=3_000.0)
    exposure = aggregate_benchmark_lst_exposure([row, dict(row)])

    assert exposure.total_usd == pytest.approx(6_000.0)


def test_multiple_lst_positions_aggregate_into_one_eth_staking_row_and_keep_morpho_cost():
    observed = build_yield_summary(
        "user",
        [
            {
                "snapshot_at": "2026-09-05",
                "protocol_name": "Morpho",
                "chain": "eth",
                "token_yield_usd": -2.0,
                "current_amounts": {"USDT": {"amount": -101.0, "price": 1.0}},
                "previous_amounts": {"USDT": {"amount": -99.0, "price": 1.0}},
                "name_item": "Lending",
            }
        ],
        ("30d",),
        "none",
    )
    exposure = aggregate_benchmark_lst_exposure(
        [
            _exposure_row("wstETH", amount=2.0, price=3_000.0, source_id="morpho-1"),
            _exposure_row("cbETH", amount=1.0, price=2_900.0, source_id="aave-1"),
            _exposure_row("wstETH", amount=1.0, price=3_000.0, source_id="wallet-1", exposure_type="idle", source_kind="idle"),
        ]
    )

    result = with_eth_staking_income(observed, exposure, benchmark_apr=0.025)
    rows = result.windows["30d"].protocol_breakdown

    assert [row.protocol for row in rows].count(ETH_STAKING_PROTOCOL_NAME) == 1
    staking = next(row for row in rows if row.protocol == ETH_STAKING_PROTOCOL_NAME)
    morpho = next(row for row in rows if row.protocol == "Morpho")
    assert staking.token_symbols == ["cbETH", "wstETH"]
    assert staking.window.average_daily_yield_usd == pytest.approx(
        (11_900.0 * 0.025) / 365.0
    )
    assert morpho.window.average_daily_yield_usd == pytest.approx(-2.0)


def test_lido_apr_percentage_is_normalized_explicitly():
    assert LidoStakingAprProvider._parse_apr({"data": {"smaApr": 2.5}}) == pytest.approx(
        0.025
    )


@pytest.mark.asyncio
async def test_lido_failure_uses_last_successful_cached_value(monkeypatch):
    analytics_cache.delete(lido_module._FRESH_CACHE_KEY)
    analytics_cache.delete(lido_module._STALE_CACHE_KEY)
    analytics_cache.set(
        lido_module._STALE_CACHE_KEY,
        0.024,
        timedelta(hours=1),
    )
    provider = LidoStakingAprProvider()
    monkeypatch.setattr(
        provider,
        "_fetch_live_apr",
        AsyncMock(side_effect=RuntimeError("temporary outage")),
    )

    assert await provider.get_benchmark_apr() == pytest.approx(0.024)


@pytest.mark.asyncio
async def test_lido_failure_without_prior_observation_degrades_to_none(monkeypatch):
    analytics_cache.delete(lido_module._FRESH_CACHE_KEY)
    analytics_cache.delete(lido_module._STALE_CACHE_KEY)
    provider = LidoStakingAprProvider()
    monkeypatch.setattr(
        provider,
        "_fetch_live_apr",
        AsyncMock(side_effect=RuntimeError("temporary outage")),
    )

    assert await provider.get_benchmark_apr() is None


class _QueryServiceStub:
    def __init__(
        self,
        observed_rows: list[dict[str, Any]],
        exposure_rows: list[dict[str, Any]],
    ) -> None:
        self.observed_rows = observed_rows
        self.exposure_rows = exposure_rows

    async def fetch_time_range_query(
        self,
        db,
        query_name: str,
        user_id: UUID | str,
        start_date,
        end_date,
        *,
        limit=None,
        wallet_address: str | None = None,
        extra_params=None,
    ) -> list[dict[str, Any]]:
        return self.observed_rows

    def execute_query(self, db, query_name: str, params=None) -> list[dict[str, Any]]:
        return self.exposure_rows


def _morpho_snapshot(user_id: UUID, snapshot_at: datetime, debt: float) -> dict[str, Any]:
    borrow = [{"optimized_symbol": "USDT", "amount": debt, "price": 1.0}]
    supply = [{"optimized_symbol": "wstETH", "amount": 2.0, "price": 3_000.0}]
    return {
        "user_id": str(user_id),
        "chain": "eth",
        "protocol_name": "Morpho",
        "snapshot_at": snapshot_at,
        "protocol_type": "token_based",
        "protocol_data": {
            "supply_tokens": supply,
            "borrow_tokens": borrow,
            "reward_tokens": [],
        },
        "name_item": "Lending",
    }


class _FailingAprProvider:
    async def get_benchmark_apr(self) -> float | None:
        raise RuntimeError("Lido unavailable")


@pytest.mark.asyncio
async def test_yield_summary_survives_apr_failure_and_preserves_morpho_cost(db_session):
    user_id = uuid4()
    day0 = datetime(2026, 9, 4, tzinfo=UTC)
    query_service = _QueryServiceStub(
        [
            _morpho_snapshot(user_id, day0, debt=100.0),
            _morpho_snapshot(user_id, day0 + timedelta(days=1), debt=101.0),
        ],
        [_exposure_row("wstETH", amount=2.0, price=3_000.0)],
    )
    service = YieldReturnService(
        db_session,
        query_service,  # type: ignore[arg-type]
        PortfolioAnalyticsContext(),
        staking_apr_provider=_FailingAprProvider(),
    )

    response = await service.get_yield_summary(
        user_id,
        windows=("30d",),
        outlier_strategy="none",
    )

    rows = response.windows["30d"].protocol_breakdown
    assert all(row.protocol != ETH_STAKING_PROTOCOL_NAME for row in rows)
    morpho = next(row for row in rows if row.protocol == "Morpho")
    assert morpho.window.average_daily_yield_usd == pytest.approx(-1.0)
