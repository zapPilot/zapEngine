from __future__ import annotations

import math
from datetime import date
from decimal import Decimal

import pytest

from scripts.pinned_strategy.codec import (
    EMPTY_STATES,
    WAD,
    check_collisions,
    epoch_day,
    to_wad,
)
from scripts.pinned_strategy.compile import ARTIFACT, compile_source
from scripts.pinned_strategy.evm import SliceEVM
from scripts.pinned_strategy.shadow import shadow_compare
from src.models.backtesting import BacktestCompareConfigV3, BacktestCompareRequestV3
from src.services.backtesting.execution.compare import run_compare_v3_on_data
from tests.test_validation_events import EVENTS, _synthetic_market_history


@pytest.fixture(scope="module")
def evm():
    return SliceEVM()


def compare(prices, sentiments, start, end, touch):
    request = BacktestCompareRequestV3(
        token_symbol="BTC",
        start_date=start,
        end_date=end,
        total_capital=10000,
        configs=[
            BacktestCompareConfigV3(
                config_id="slice",
                strategy_id="dma_fgi_portfolio_rules",
                params={"signal": {"cross_on_touch": touch}},
            )
        ],
    )
    return run_compare_v3_on_data(prices, sentiments, request, start)


@pytest.mark.parametrize("touch", [True, False])
@pytest.mark.parametrize("event", EVENTS, ids=lambda event: event.id)
def test_validation_shadow(evm, event, touch):
    prices, sentiments, start, end = _synthetic_market_history(event=event)
    baseline = compare(prices, sentiments, start, end, touch)
    with shadow_compare(evm, strict_distance=True) as metrics:
        actual = compare(prices, sentiments, start, end, touch)
    assert actual == baseline
    assert metrics.days > 0


def test_artifact():
    import json

    assert compile_source() == json.loads(ARTIFACT.read_text())


def test_codec():
    values = [math.nextafter(100.0, 0), 100.0, math.nextafter(100.0, math.inf)]
    check_collisions(values)
    assert list(map(to_wad, values)) == sorted(set(map(to_wad, values)))
    for value in values:
        assert Decimal(to_wad(value)) <= Decimal(value) * WAD
    with pytest.raises(ValueError, match="collision"):
        check_collisions([0.0, 1e-20])
    for value in [float("nan"), float("inf"), -1.0, 1e100]:
        with pytest.raises(ValueError):
            to_wad(value)
    assert epoch_day(date(2025, 1, 1)) == 20089


def test_touch_and_cooldown_boundary(evm):
    states = evm.call("warmup", EMPTY_STATES, [(110 * WAD, 100 * WAD)] * 3)
    views, states = evm.call("observe", states, [(100 * WAD, 100 * WAD)] * 3, 100, True)
    assert [v[2] for v in views] == [1] * 3
    states = evm.call("commit", states, views, 100, 7, True, 7)
    for day, expected in [
        (114, [True, True, True]),
        (115, [False, True, True]),
        (130, [False, True, True]),
        (131, [False, False, False]),
    ]:
        views, _ = evm.call("observe", states, [(110 * WAD, 100 * WAD)] * 3, day, True)
        assert [v[3] for v in views] == expected
    views, _ = evm.call(
        "observe", [(2, 2, 0, 0)] * 3, [(100 * WAD, 100 * WAD)] * 3, 200, True
    )
    assert [v[2] for v in views] == [2] * 3
    views, _ = evm.call(
        "observe", [(2, 2, 0, 0)] * 3, [(100 * WAD, 100 * WAD)] * 3, 200, False
    )
    assert [v[2] for v in views] == [0] * 3


def test_missing_asset_freezes_state(evm):
    states = [(1, 2, 120, 1)] * 3
    views, actual = evm.call("observe", states, [(0, 0)] * 3, 140, True)
    assert actual == tuple(states)
    assert evm.call("commit", actual, views, 140, 7, True, 7) == actual


def test_peer_exit_and_global_cooldown(evm):
    views = [
        (0, 0, 0, False, 0, 0, 0),
        (2, 1, 1, False, 0, 0, 0),
        (0, 0, 0, False, 0, 0, 0),
    ]
    result = evm.call("cross_down_exit", views, [0, WAD // 2, 0, 0, WAD // 2], 100, 129)
    assert result[:6] == (True, True, 1, 2, 6, 4)
    assert result[6] == (0, 0, 0, WAD)
    assert evm.call("cross_down_exit", views, [0] * 5, 100, 130)[:3] == (True, False, 0)


def test_remainder_never_creates_stable_dust(evm):
    views = [(0, 0, 0, False, 0, 0, 0)] * 3
    result = evm.call("cross_down_exit", views, [1, 1, 1, 0, 0], 0, 100)
    assert result[6] == (333333333333333334, 333333333333333333, 333333333333333333, 0)


@pytest.mark.parametrize(
    "allocation",
    [
        [0.0, 0.5, 0.0, 0.0, 0.5],
        [1e-12, 0.2, 0.3, 0.5 - 1e-12, 0.0],
        [math.nextafter(1e-12, 0), 0.0, 0.0, 1.0, 0.0],
        [math.nextafter(1e-12, math.inf), 0.0, 0.0, 1.0, 0.0],
        [0.0, 0.0, 0.0, 1.0, 0.0],
        [0.125, 0.25, 0.375, 0.0, 0.25],
    ],
)
def test_rule_allocation_against_python(evm, allocation):
    from scripts.pinned_strategy.codec import KEYS, mask
    from src.services.backtesting.portfolio_rules.base import (
        PortfolioRuleConfig,
        PortfolioSnapshot,
    )
    from src.services.backtesting.portfolio_rules.cross_down_exit import (
        CrossDownExitRule,
    )
    from src.services.backtesting.signals.dma_gated_fgi.types import (
        DmaCooldownState,
        DmaMarketState,
    )

    state = DmaMarketState(
        signal_id="dma_gated_fgi",
        dma_200=100.0,
        dma_distance=-0.1,
        zone="below",
        cross_event="cross_down",
        actionable_cross_event="cross_down",
        cooldown_state=DmaCooldownState(False, 0, None),
        fgi_value=50.0,
        fgi_slope=0.0,
        fgi_regime="neutral",
        regime_source="label",
        ath_event=None,
    )
    snapshot = PortfolioSnapshot(
        assets={"BTC": state},
        current_asset_allocation=dict(zip(KEYS, allocation, strict=True)),
        previous_fgi_regime={},
    )
    intent = CrossDownExitRule().build_intent(snapshot, config=PortfolioRuleConfig())
    views = [
        (0, 0, 0, False, 0, 0, 0),
        (2, 1, 1, False, 0, 0, -WAD // 10),
        (0, 0, 0, False, 0, 0, 0),
    ]
    result = evm.call("cross_down_exit", views, list(map(to_wad, allocation)), 0, 200)
    assert result[5] == mask(intent.diagnostics["portfolio_rule_assets"])
    assert sum(result[6]) == WAD
    for i, key in enumerate(KEYS[:4]):
        assert abs(result[6][i] / WAD - intent.target_allocation[key]) <= 1e-12
