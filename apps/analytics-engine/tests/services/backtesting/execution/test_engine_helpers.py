from __future__ import annotations

from datetime import date

import pytest

from src.models.backtesting import (
    BacktestAssumptions,
    BacktestCompareConfigV3,
    BacktestResponse,
)
from src.services.backtesting.execution.compare import (
    materialize_compare_request,
)
from src.services.backtesting.execution.engine import StrategyEngine
from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.execution.state import (
    build_strategy_state,
    build_strategy_summaries,
    calculate_roi_percent,
)
from src.services.backtesting.features import MACRO_FEAR_GREED_FEATURE
from src.services.backtesting.strategies.base import (
    BaseStrategy,
    StrategyAction,
    StrategyContext,
)
from src.services.backtesting.utils.two_bucket import (
    normalize_runtime_allocation,
    sanitize_runtime_allocation,
)
from tests.services.backtesting.support import make_strategy_snapshot


class WarmupAwareStrategy(BaseStrategy):
    strategy_id = "warmup_aware"
    display_name = "Warmup Aware"
    canonical_strategy_id = "dma_fgi_portfolio_rules"

    def __init__(self) -> None:
        self.warmup_calls = 0

    def warmup_day(self, context: StrategyContext) -> None:
        del context
        self.warmup_calls += 1

    def on_day(self, context: StrategyContext) -> StrategyAction:
        del context
        return StrategyAction(snapshot=make_strategy_snapshot(reason="hold"))


class ExplicitSignalSummaryStrategy(BaseStrategy):
    strategy_id = "summary_signal"
    display_name = "Summary Signal"
    canonical_strategy_id = "dma_fgi_portfolio_rules"
    summary_signal_id = "explicit_signal"

    def on_day(self, context: StrategyContext) -> StrategyAction:
        del context
        return StrategyAction(
            snapshot=make_strategy_snapshot(
                action="buy",
                reason="summary_signal",
                target_allocation={
                    "btc": 1.0,
                    "eth": 0.0,
                    "spy": 0.0,
                    "stable": 0.0,
                    "alt": 0.0,
                },
            )
        )

    def parameters(self) -> dict[str, object]:
        return {"lookback_days": 30}


def test_engine_returns_empty_response_for_no_prices() -> None:
    engine = StrategyEngine()

    result = engine.run(prices=[], sentiments={}, strategies=[])

    assert result == BacktestResponse(
        assumptions=BacktestAssumptions(), strategies={}, timeline=[]
    )


def test_resolve_start_snapshot_falls_back_to_first_price_when_start_is_after_range() -> (
    None
):
    first_price, init_date, init_extra, init_price_map = (
        StrategyEngine._resolve_start_snapshot(
            prices=[
                {
                    "date": date(2025, 1, 1),
                    "price": 100.0,
                    "extra_data": {"dma_200": 95.0},
                }
            ],
            user_start_date=date(2025, 1, 10),
        )
    )

    assert first_price == 100.0
    assert init_date == date(2025, 1, 1)
    assert init_extra == {"dma_200": 95.0}
    assert init_price_map == {}


def test_engine_warmup_days_are_excluded_from_timeline() -> None:
    strategy = WarmupAwareStrategy()
    engine = StrategyEngine()

    result = engine.run(
        prices=[
            {"date": date(2025, 1, 1), "price": 100.0},
            {"date": date(2025, 1, 2), "price": 101.0},
        ],
        sentiments={
            date(2025, 1, 1): {"label": "neutral", "value": 50},
            date(2025, 1, 2): {"label": "neutral", "value": 50},
        },
        strategies=[strategy],
        total_capital=1_000.0,
        user_start_date=date(2025, 1, 2),
    )

    assert strategy.warmup_calls == 1
    assert len(result.timeline) == 1
    assert result.timeline[0].market.date == date(2025, 1, 2)


def test_engine_serializes_macro_fear_greed_on_market_snapshot() -> None:
    engine = StrategyEngine()
    macro_fear_greed = {
        "score": 18.0,
        "label": "extreme_fear",
        "source": "cnn_fear_greed_unofficial",
        "updated_at": "2025-01-01T12:00:00+00:00",
        "raw_rating": "Extreme Fear",
    }

    result = engine.run(
        prices=[
            {
                "date": date(2025, 1, 1),
                "price": 100.0,
                "extra_data": {MACRO_FEAR_GREED_FEATURE: macro_fear_greed},
            }
        ],
        sentiments={date(2025, 1, 1): {"label": "neutral", "value": 50}},
        strategies=[WarmupAwareStrategy()],
        total_capital=1_000.0,
    )

    dumped = result.model_dump(mode="json")
    market = dumped["timeline"][0]["market"]
    assert market["macro_fear_greed"] == macro_fear_greed


def test_allocation_helpers_fall_back_to_all_stable() -> None:
    assert normalize_runtime_allocation({"spot": 0.0, "stable": 0.0}) == {
        "spot": 0.0,
        "stable": 1.0,
    }
    assert sanitize_runtime_allocation({"spot": -1e-9, "stable": -2.0}) == {
        "spot": 0.0,
        "stable": 1.0,
    }


def test_misc_engine_helpers_cover_edge_cases() -> None:
    assert calculate_roi_percent(100.0, 0.0) == 0.0


def test_build_strategy_summaries_uses_explicit_summary_signal_id() -> None:
    strategy = ExplicitSignalSummaryStrategy()
    summary = build_strategy_summaries(
        strategies=[strategy],
        portfolios={"summary_signal": Portfolio(spot_balance=1.0, stable_balance=0.0)},
        trade_counts={"summary_signal": 1},
        total_capital=100.0,
        last_price=100.0,
        last_market_prices=None,
        strategy_daily_values={"summary_signal": [100.0, 110.0]},
        benchmark_daily_prices=[100.0, 105.0],
        price_pnl_usd={"summary_signal": 10.0},
        risk_free_apr=0.03,
    )["summary_signal"]

    assert summary.signal_id == "explicit_signal"
    assert summary.parameters == {"lookback_days": 30}


def test_materialize_compare_request_passes_through_request() -> None:
    from src.models.backtesting import BacktestCompareRequestV3

    request = BacktestCompareRequestV3(
        token_symbol="BTC",
        total_capital=10_000.0,
        configs=[
            BacktestCompareConfigV3(
                config_id="portfolio_rules_runtime",
                strategy_id="dma_fgi_portfolio_rules",
                params={},
            ),
        ],
    )

    materialized = materialize_compare_request(request)

    assert materialized is request


# ---------------------------------------------------------------------------
# Targeted coverage tests for engine.py uncovered branches
# ---------------------------------------------------------------------------


def test_resolve_price_map_skips_non_string_symbol() -> None:
    """Cover line 197: symbol not str → skipped."""
    price_map = StrategyEngine._resolve_price_map(
        {"prices": {1: 50_000.0, "btc": 50_000.0}}
    )
    assert "btc" in price_map
    assert 1 not in price_map


def test_resolve_price_map_skips_non_numeric_value() -> None:
    """Cover line 199: value not int|float → skipped."""
    price_map = StrategyEngine._resolve_price_map(
        {"prices": {"btc": "not_a_number", "eth": 3_000.0}}
    )
    assert "btc" not in price_map
    assert price_map.get("eth") == pytest.approx(3_000.0)


def test_resolve_price_map_skips_non_positive_value() -> None:
    """Cover line 202: numeric value <= 0 → skipped."""
    price_map = StrategyEngine._resolve_price_map(
        {"prices": {"btc": -100.0, "eth": 3_000.0}}
    )
    assert "btc" not in price_map
    assert price_map.get("eth") == pytest.approx(3_000.0)


def test_resolve_context_price_falls_back_when_asset_missing_from_map() -> None:
    """Cover lines 426-427: ValueError from resolve_spot_price → fallback_price."""
    portfolio = Portfolio(spot_balance=1.0, stable_balance=0.0, spot_asset="BTC")
    price = StrategyEngine._resolve_context_price(
        portfolio=portfolio,
        fallback_price=50_000.0,
        price_map={"eth": 3_000.0},
    )
    assert price == pytest.approx(50_000.0)


@pytest.mark.parametrize(
    (
        "spot_balance",
        "stable_balance",
        "spot_asset",
        "target_allocation",
        "reason",
        "expected_spot_asset",
    ),
    [
        (
            1.0,
            0.0,
            "BTC",
            {"btc": 1.0, "eth": 0.0, "spy": 0.0, "stable": 0.0, "alt": 0.0},
            "enter_btc",
            "BTC",
        ),
        (
            1.0,
            0.0,
            "ETH",
            {"btc": 0.0, "eth": 1.0, "spy": 0.0, "stable": 0.0, "alt": 0.0},
            "enter_eth",
            "ETH",
        ),
        (
            0.0,
            1_000.0,
            "ETH",
            {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
            "exit_spot",
            None,
        ),
    ],
)
def test_build_strategy_state_serializes_spot_asset_matrix(
    spot_balance: float,
    stable_balance: float,
    spot_asset: str,
    target_allocation: dict[str, float],
    reason: str,
    expected_spot_asset: str | None,
) -> None:
    risk_on_share = (
        target_allocation["btc"] + target_allocation["eth"] + target_allocation["spy"]
    )
    snapshot = make_strategy_snapshot(
        action="buy" if risk_on_share > 0 else "sell",
        target_allocation=target_allocation,
        reason=reason,
    )
    portfolio = Portfolio(
        spot_balance=spot_balance,
        stable_balance=stable_balance,
        spot_asset=spot_asset,
    )

    state = build_strategy_state(
        portfolio=portfolio,
        price={"eth": 3_000.0, "btc": 100_000.0},
        snapshot=snapshot,
    )

    assert state.portfolio.spot_asset == expected_spot_asset


# ---------------------------------------------------------------------------
# Targeted coverage tests for state.py uncovered branches
# ---------------------------------------------------------------------------


def test_serialize_signal_details_returns_empty_dict_when_signal_is_none() -> None:
    """Cover line 157: signal=None in _serialize_signal_details → {}."""
    from src.services.backtesting.decision import AllocationIntent
    from src.services.backtesting.domain import ExecutionOutcome, StrategySnapshot
    from src.services.backtesting.execution.state import _serialize_signal_details

    snapshot = StrategySnapshot(
        signal=None,
        decision=AllocationIntent(
            action="hold",
            target_allocation=None,
            allocation_name=None,
            immediate=False,
            reason="hold",
            rule_group="none",
            decision_score=0.0,
        ),
        execution=ExecutionOutcome(event=None),
    )
    result = _serialize_signal_details(snapshot)
    assert result == {}


def test_resolve_summary_price_falls_back_when_portfolio_asset_missing() -> None:
    """Cover lines 212-213: spot asset not in last_market_prices → last_price."""
    from src.services.backtesting.execution.state import _resolve_summary_price_input

    portfolio = Portfolio(spot_balance=1.0, stable_balance=0.0, spot_asset="BTC")
    result = _resolve_summary_price_input(
        portfolio=portfolio,
        last_price=50_000.0,
        last_market_prices={"eth": 3_000.0},
    )
    assert result == pytest.approx(50_000.0)
