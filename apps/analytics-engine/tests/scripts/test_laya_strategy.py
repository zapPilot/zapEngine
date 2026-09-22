from __future__ import annotations

from datetime import date, timedelta

from scripts.research.laya.fakes import FakeLayaClient
from scripts.research.laya.strategy import (
    LayaDirectAllocationStrategy,
    LayaExperimentSpec,
    resolved_laya_config,
)
from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_BTC_RATIO_DMA_200_FEATURE,
    ETH_BTC_RATIO_FEATURE,
    ETH_DMA_200_FEATURE,
    SPY_DMA_200_FEATURE,
)
from src.services.backtesting.strategies.base import StrategyContext
from src.services.backtesting.strategy_registry import list_strategy_recipes


def _answers(stable: int, spy: int, btc: int, eth: int) -> dict[str, object]:
    return {
        bucket: {
            "type": "score",
            "score": score,
            "probabilities": {str(score): 1.0},
            "confidence": 0.9,
        }
        for bucket, score in {
            "stable": stable,
            "spy": spy,
            "btc": btc,
            "eth": eth,
        }.items()
    }


def _context(day: date, portfolio: Portfolio) -> StrategyContext:
    prices = {"btc": 100.0, "eth": 100.0, "spy": 100.0}
    histories = {key: [100.0 + index * 0.1 for index in range(120)] for key in prices}
    return StrategyContext(
        date=day,
        price=100.0,
        sentiment={"label": "neutral", "value": 50},
        price_history=histories["btc"],
        portfolio=portfolio,
        price_map=prices,
        price_history_map=histories,
        extra_data={
            DMA_200_FEATURE: 90.0,
            ETH_DMA_200_FEATURE: 90.0,
            SPY_DMA_200_FEATURE: 90.0,
            ETH_BTC_RATIO_FEATURE: 0.055,
            ETH_BTC_RATIO_DMA_200_FEATURE: 0.05,
        },
    )


def _apply(portfolio: Portfolio, context: StrategyContext, transfers) -> None:
    for transfer in transfers or []:
        portfolio.execute_transfer(
            transfer.from_bucket,
            transfer.to_bucket,
            transfer.amount_usd,
            context.portfolio_price,
        )


def test_three_day_strategy_flow_and_laya_sell_does_not_start_dma_cooldown() -> None:
    fake = FakeLayaClient(
        mode="scripted",
        scripted=[
            _answers(0, 2, 3, 3),
            _answers(0, 2, 3, 3),
            _answers(4, 1, 0, 0),
        ],
    )
    portfolio = Portfolio.from_asset_allocation(
        10_000.0,
        {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0},
        {"btc": 100.0, "eth": 100.0, "spy": 100.0},
    )
    strategy = LayaDirectAllocationStrategy(
        total_capital=10_000.0,
        encoding="per_bucket_score",
        client=fake,
        initial_asset_allocation={
            "btc": 0.0,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 1.0,
            "alt": 0.0,
        },
    )
    start = date(2026, 1, 1)
    context1 = _context(start, portfolio)
    strategy.initialize(portfolio, None, context1)

    day1 = strategy.on_day(context1)
    assert day1.transfers
    assert day1.snapshot.decision.allocation_name == "laya_per_bucket_score"
    assert not day1.snapshot.decision.allocation_name.startswith(
        "portfolio_eth_btc_ratio_rotation_"
    )
    _apply(portfolio, context1, day1.transfers)

    context2 = _context(start + timedelta(days=1), portfolio)
    day2 = strategy.on_day(context2)
    assert day2.transfers is None
    assert day2.snapshot.decision.reason == "laya_target_unchanged"

    context3 = _context(start + timedelta(days=2), portfolio)
    day3 = strategy.on_day(context3)
    assert day3.transfers
    assert day3.snapshot.decision.action == "sell"
    latest = strategy.signal_component.latest_state
    assert latest is not None
    for dma_state in (
        latest.spy_dma_state,
        latest.btc_dma_state,
        latest.eth_dma_state,
    ):
        assert dma_state is not None
        assert dma_state.cooldown_state.active is False


def test_resolved_laya_config_is_research_only_and_not_registered() -> None:
    fake = FakeLayaClient()
    resolved = resolved_laya_config(
        LayaExperimentSpec(encoding="static_equal_weight"),
        fake,
    )
    assert resolved.request_config_id == "laya_static_equal_weight_c1"
    assert resolved.strategy_id == "dma_fgi_portfolio_rules"
    assert resolved.warmup_lookback_days == 100
    assert resolved.request_config_id not in {
        recipe.strategy_id for recipe in list_strategy_recipes()
    }
