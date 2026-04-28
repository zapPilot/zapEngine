"""Tests for the recipe-first daily suggestion service."""

from __future__ import annotations

from dataclasses import replace
from datetime import date
from types import SimpleNamespace
from uuid import UUID

import pytest

from src.config.strategy_presets import resolve_seed_strategy_config
from src.services.backtesting.capabilities import PortfolioBuckets
from src.services.backtesting.composition import build_saved_config_from_legacy
from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.domain import (
    DmaSignalDiagnostics,
    ExecutionOutcome,
    ExecutionPluginDiagnostic,
    SignalObservation,
    StrategySnapshot,
)
from src.services.backtesting.strategies.base import StrategyAction, TransferIntent
from src.services.backtesting.strategy_registry import get_strategy_recipe
from src.services.exceptions import MarketDataUnavailableError
from src.services.strategy.strategy_daily_suggestion_service import (
    StrategyDailySuggestionService,
)
from tests.services.backtesting.support import mock_portfolio


def _service() -> tuple[StrategyDailySuggestionService, dict[str, object]]:
    mocks = {
        "landing_page_service": SimpleNamespace(),
        "regime_tracking_service": SimpleNamespace(),
        "sentiment_service": SimpleNamespace(),
        "token_price_service": SimpleNamespace(),
        "canonical_snapshot_service": SimpleNamespace(),
        "strategy_config_store": SimpleNamespace(
            resolve_config=lambda config_id: resolve_seed_strategy_config(config_id)
        ),
    }
    service = StrategyDailySuggestionService(**mocks)
    return service, mocks


def _default_signal() -> SignalObservation:
    return SignalObservation(
        signal_id="dma_gated_fgi",
        regime="greed",
        confidence=1.0,
        raw_value=72.0,
        ath_event="token_ath",
        dma=DmaSignalDiagnostics(
            dma_200=95_000.0,
            distance=0.05,
            zone="above",
            cross_event=None,
            cooldown_active=False,
            cooldown_remaining_days=0,
            cooldown_blocked_zone=None,
            fgi_slope=0.2,
        ),
    )


def _sell_snapshot(*, signal: SignalObservation | None) -> StrategySnapshot:
    return StrategySnapshot(
        signal=signal,
        decision=AllocationIntent(
            action="sell",
            target_allocation={
                "btc": 0.0,
                "eth": 0.0,
                "spy": 0.0,
                "stable": 1.0,
                "alt": 0.0,
            },
            allocation_name="risk_off",
            immediate=False,
            reason="above_greed_sell",
            rule_group="dma_fgi",
            decision_score=-1.0,
        ),
        execution=ExecutionOutcome(
            event=None,
            transfers=[],
            blocked_reason="interval_wait",
            step_count=5,
            steps_remaining=4,
            interval_days=2,
            plugin_diagnostics=(
                ExecutionPluginDiagnostic(
                    plugin_id="dma_buy_gate",
                    payload={
                        "buy_strength": None,
                        "sideways_confirmed": None,
                    },
                ),
            ),
        ),
    )


def _rotation_snapshot(*, signal: SignalObservation | None) -> StrategySnapshot:
    return StrategySnapshot(
        signal=signal,
        decision=AllocationIntent(
            action="buy",
            target_allocation={"btc": 0.6, "eth": 0.4, "stable": 0.0, "alt": 0.0},
            allocation_name="rotation_risk_on",
            immediate=False,
            reason="eth_outperforming_btc",
            rule_group="rotation",
            decision_score=1.0,
        ),
        execution=ExecutionOutcome(
            event=None,
            transfers=[],
            blocked_reason=None,
            step_count=2,
            steps_remaining=0,
            interval_days=1,
            plugin_diagnostics=(),
        ),
    )


def _hold_rotation_snapshot(
    *,
    signal: SignalObservation | None,
    transfers: list[TransferIntent] | None = None,
    blocked_reason: str | None = None,
    plugin_diagnostics: tuple[ExecutionPluginDiagnostic, ...] = (),
) -> StrategySnapshot:
    serialized_transfers = [] if transfers is None else list(transfers)
    return StrategySnapshot(
        signal=signal,
        decision=AllocationIntent(
            action="hold",
            target_allocation={"btc": 0.4, "eth": 0.6, "stable": 0.0, "alt": 0.0},
            allocation_name="eth_btc_ratio_rebalance",
            immediate=False,
            reason="eth_btc_ratio_rebalance",
            rule_group="rotation",
            decision_score=0.0,
        ),
        execution=ExecutionOutcome(
            event="rebalance" if serialized_transfers else None,
            transfers=serialized_transfers,
            blocked_reason=blocked_reason,
            step_count=1 if serialized_transfers else 0,
            steps_remaining=0,
            interval_days=1 if serialized_transfers else 0,
            plugin_diagnostics=plugin_diagnostics,
        ),
    )


def test_map_portfolio_to_buckets_uses_two_bucket_model() -> None:
    buckets = get_strategy_recipe("dma_gated_fgi").portfolio_bucket_mapper(
        mock_portfolio(btc=2_000.0, eth=3_000.0, stable=4_000.0, others=1_000.0)
    )
    assert buckets == PortfolioBuckets(
        spot_value=6_000.0,
        stable_value=4_000.0,
        btc_value=2_000.0,
        eth_value=3_000.0,
        stable_category_value=4_000.0,
        alt_value=1_000.0,
    )


def test_get_daily_suggestion_rejects_non_dma_preset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, mocks = _service()
    mocks["strategy_config_store"].resolve_config = (
        lambda _config_id: resolve_seed_strategy_config("dca_classic")
    )
    with pytest.raises(
        ValueError, match="Strategy 'dca_classic' does not support /daily-suggestion"
    ):
        service.get_daily_suggestion(UUID(int=1))


def test_get_daily_suggestion_raises_market_data_unavailable_when_dma_completely_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When DMA-200 has no data at all, the service can't forward-fill and must
    surface a transient `MarketDataUnavailableError` (mapped to HTTP 503), not
    a `ValueError` (HTTP 400 — caller error). Forward-fill within tolerance is
    covered by `test_get_daily_suggestion_forward_fills_stale_dma`.
    """
    service, mocks = _service()
    mocks["strategy_config_store"].resolve_config = (
        lambda _config_id: resolve_seed_strategy_config("dma_gated_fgi_default")
    )
    mocks["landing_page_service"].get_landing_page_data = (
        lambda _user_id: mock_portfolio(stable=10_000.0)
    )
    mocks["token_price_service"].get_latest_price = lambda _symbol: SimpleNamespace(
        date="2025-01-10", price_usd=100_000.0
    )
    mocks["token_price_service"].get_price_history = lambda **_: [
        SimpleNamespace(date="2025-01-10", price_usd=100_000.0)
    ]
    mocks["token_price_service"].get_dma_history = lambda **_: {}
    mocks["sentiment_service"].get_current_sentiment_sync = lambda: SimpleNamespace(
        status="Greed", value=72
    )
    mocks["sentiment_service"].get_daily_sentiment_aggregates = lambda **_: []

    with pytest.raises(MarketDataUnavailableError, match="Market data lag exceeds"):
        service.get_daily_suggestion(UUID(int=2))


def test_get_daily_suggestion_builds_recipe_first_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, mocks = _service()
    mocks["strategy_config_store"].resolve_config = (
        lambda _config_id: resolve_seed_strategy_config("dma_gated_fgi_default")
    )

    def _fake_daily_recommendation(self, input_data):
        assert input_data.extra_data == {"dma_200": 95_000.0}
        assert input_data.warmup_extra_data_by_date[date(2025, 1, 10)] == {
            "dma_200": 95_000.0
        }
        return StrategyAction(snapshot=_sell_snapshot(signal=_default_signal()))

    monkeypatch.setattr(
        "src.services.backtesting.strategies.composed_signal.ComposedSignalStrategy.get_daily_recommendation",
        _fake_daily_recommendation,
    )

    mocks["landing_page_service"].get_landing_page_data = (
        lambda _user_id: mock_portfolio(btc=2_500.0, stable=7_500.0)
    )
    mocks["token_price_service"].get_latest_price = lambda _symbol: SimpleNamespace(
        date="2025-01-10", price_usd=100_000.0
    )
    mocks["token_price_service"].get_price_history = lambda **_: [
        SimpleNamespace(date="2025-01-10", price_usd=100_000.0)
    ]
    mocks["token_price_service"].get_dma_history = lambda **_: {
        date(2025, 1, 10): 95_000.0
    }
    mocks["sentiment_service"].get_current_sentiment_sync = lambda: SimpleNamespace(
        status="Greed", value=72
    )
    mocks["sentiment_service"].get_daily_sentiment_aggregates = lambda **_: []

    response = service.get_daily_suggestion(UUID(int=3))
    assert response.config_id == "dma_gated_fgi_default"
    assert response.config_display_name == "DMA Gated FGI Default"
    assert response.strategy_id == "dma_gated_fgi"
    assert response.context.portfolio.allocation.spot == pytest.approx(0.25)
    assert response.context.signal.id == "dma_gated_fgi"
    assert response.context.signal.details["ath_event"] == "token_ath"
    assert response.context.strategy.reason_code == "above_greed_sell"
    assert response.context.strategy.stance == "sell"
    assert response.action.status == "blocked"
    assert response.action.required is False
    assert response.action.kind is None
    assert response.action.reason_code == "interval_wait"
    assert response.action.transfers == []
    assert response.context.market.token_price == {"btc": 100_000.0}
    assert response.context.portfolio.asset_allocation is not None
    assert response.context.portfolio.asset_allocation.btc == pytest.approx(0.25)
    assert response.context.portfolio.asset_allocation.eth == pytest.approx(0.0)
    assert response.context.portfolio.asset_allocation.stable == pytest.approx(0.75)
    assert response.context.portfolio.asset_allocation.alt == pytest.approx(0.0)
    assert response.context.portfolio.total_value == pytest.approx(10_000.0)
    assert response.context.portfolio.total_assets_usd == pytest.approx(10_000.0)
    assert response.context.portfolio.total_debt_usd == pytest.approx(0.0)
    assert response.context.portfolio.total_net_usd == pytest.approx(10_000.0)
    assert response.context.target.allocation.btc == pytest.approx(0.0)
    assert response.context.target.allocation.eth == pytest.approx(0.0)
    assert response.context.target.allocation.stable == pytest.approx(1.0)
    assert response.context.target.allocation.alt == pytest.approx(0.0)


def test_get_daily_suggestion_dma_does_not_require_eth_price_for_eth_holdings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, mocks = _service()
    mocks["strategy_config_store"].resolve_config = (
        lambda _config_id: resolve_seed_strategy_config("dma_gated_fgi_default")
    )

    monkeypatch.setattr(
        "src.services.backtesting.strategies.composed_signal.ComposedSignalStrategy.get_daily_recommendation",
        lambda self, input_data: StrategyAction(
            snapshot=_sell_snapshot(signal=_default_signal())
        ),
    )

    mocks["landing_page_service"].get_landing_page_data = (
        lambda _user_id: mock_portfolio(btc=2_000.0, eth=3_000.0, stable=5_000.0)
    )
    mocks["token_price_service"].get_latest_price = lambda _symbol: SimpleNamespace(
        date="2025-01-10", price_usd=100_000.0
    )
    mocks["token_price_service"].get_price_history = lambda **_: [
        SimpleNamespace(date="2025-01-10", price_usd=100_000.0)
    ]
    mocks["token_price_service"].get_dma_history = lambda **_: {
        date(2025, 1, 10): 95_000.0
    }
    mocks["sentiment_service"].get_current_sentiment_sync = lambda: SimpleNamespace(
        status="Greed", value=72
    )
    mocks["sentiment_service"].get_daily_sentiment_aggregates = lambda **_: []

    response = service.get_daily_suggestion(UUID(int=8))

    assert response.context.market.token_price == {"btc": 100_000.0}
    assert response.context.portfolio.asset_allocation is not None
    assert response.context.portfolio.asset_allocation.btc == pytest.approx(0.2)
    assert response.context.portfolio.asset_allocation.eth == pytest.approx(0.3)
    assert response.context.portfolio.asset_allocation.stable == pytest.approx(0.5)
    assert response.context.portfolio.asset_allocation.alt == pytest.approx(0.0)
    assert response.context.target.allocation.btc == pytest.approx(0.0)
    assert response.context.target.allocation.eth == pytest.approx(0.0)
    assert response.context.target.allocation.stable == pytest.approx(1.0)
    assert response.context.target.allocation.alt == pytest.approx(0.0)


def test_get_daily_suggestion_rotation_preserves_asset_target_allocation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, mocks = _service()
    mocks["strategy_config_store"].resolve_config = (
        lambda _config_id: resolve_seed_strategy_config("eth_btc_rotation_default")
    )

    monkeypatch.setattr(
        "src.services.backtesting.strategies.composed_signal.ComposedSignalStrategy.get_daily_recommendation",
        lambda self, input_data: StrategyAction(
            snapshot=_rotation_snapshot(signal=_default_signal())
        ),
    )

    mocks["landing_page_service"].get_landing_page_data = (
        lambda _user_id: mock_portfolio(btc=6_000.0, eth=1_000.0, stable=3_000.0)
    )
    mocks["token_price_service"].get_latest_price = lambda _symbol: SimpleNamespace(
        date="2025-01-10", price_usd=100_000.0
    )

    def _price_history(**kwargs):
        token_symbol = kwargs["token_symbol"]
        if token_symbol == "ETH":
            return [SimpleNamespace(date="2025-01-10", price_usd=3_000.0)]
        return [SimpleNamespace(date="2025-01-10", price_usd=100_000.0)]

    mocks["token_price_service"].get_price_history = _price_history
    mocks["token_price_service"].get_dma_history = lambda **_: {
        date(2025, 1, 10): 95_000.0
    }
    mocks["token_price_service"].get_pair_ratio_dma_history = lambda **_: {
        date(2025, 1, 10): {
            "ratio": 0.03,
            "dma_200": 0.028,
            "is_above_dma": True,
        }
    }
    mocks["sentiment_service"].get_current_sentiment_sync = lambda: SimpleNamespace(
        status="Greed", value=72
    )
    mocks["sentiment_service"].get_daily_sentiment_aggregates = lambda **_: []

    response = service.get_daily_suggestion(
        UUID(int=9), config_id="eth_btc_rotation_default"
    )

    assert response.context.market.token_price == {"btc": 100_000.0, "eth": 3_000.0}
    assert response.context.portfolio.asset_allocation.btc == pytest.approx(0.6)
    assert response.context.portfolio.asset_allocation.eth == pytest.approx(0.1)
    assert response.context.portfolio.asset_allocation.stable == pytest.approx(0.3)
    assert response.context.portfolio.asset_allocation.alt == pytest.approx(0.0)
    assert response.context.target.allocation.btc == pytest.approx(0.6)
    assert response.context.target.allocation.eth == pytest.approx(0.4)
    assert response.context.target.allocation.stable == pytest.approx(0.0)
    assert response.context.target.allocation.alt == pytest.approx(0.0)
    assert response.action.status == "no_action"
    assert response.action.required is False
    assert response.action.kind is None
    assert response.action.transfers == []
    assert response.action.reason_code == "eth_outperforming_btc"


def test_get_daily_suggestion_exposes_debt_aware_totals_without_changing_runtime_value(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, mocks = _service()
    mocks["strategy_config_store"].resolve_config = (
        lambda _config_id: resolve_seed_strategy_config("eth_btc_rotation_default")
    )

    monkeypatch.setattr(
        "src.services.backtesting.strategies.composed_signal.ComposedSignalStrategy.get_daily_recommendation",
        lambda self, input_data: StrategyAction(
            snapshot=_hold_rotation_snapshot(signal=_default_signal())
        ),
    )

    mocks["landing_page_service"].get_landing_page_data = (
        lambda _user_id: mock_portfolio(
            btc=6_000.0,
            eth=1_000.0,
            stable=3_000.0,
            debt=2_000.0,
        )
    )
    mocks["token_price_service"].get_latest_price = lambda _symbol: SimpleNamespace(
        date="2025-01-10", price_usd=100_000.0
    )

    def _price_history(**kwargs):
        token_symbol = kwargs["token_symbol"]
        if token_symbol == "ETH":
            return [SimpleNamespace(date="2025-01-10", price_usd=3_000.0)]
        return [SimpleNamespace(date="2025-01-10", price_usd=100_000.0)]

    mocks["token_price_service"].get_price_history = _price_history
    mocks["token_price_service"].get_dma_history = lambda **_: {
        date(2025, 1, 10): 95_000.0
    }
    mocks["token_price_service"].get_pair_ratio_dma_history = lambda **_: {
        date(2025, 1, 10): {
            "ratio": 0.03,
            "dma_200": 0.028,
            "is_above_dma": True,
        }
    }
    mocks["sentiment_service"].get_current_sentiment_sync = lambda: SimpleNamespace(
        status="Greed", value=72
    )
    mocks["sentiment_service"].get_daily_sentiment_aggregates = lambda **_: []

    response = service.get_daily_suggestion(
        UUID(int=10), config_id="eth_btc_rotation_default"
    )

    assert response.context.portfolio.total_value == pytest.approx(10_000.0)
    assert response.context.portfolio.total_assets_usd == pytest.approx(10_000.0)
    assert response.context.portfolio.total_debt_usd == pytest.approx(2_000.0)
    assert response.context.portfolio.total_net_usd == pytest.approx(8_000.0)


def test_get_daily_suggestion_marks_hold_rotation_transfers_as_action_required(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, mocks = _service()
    mocks["strategy_config_store"].resolve_config = (
        lambda _config_id: resolve_seed_strategy_config("eth_btc_rotation_default")
    )

    monkeypatch.setattr(
        "src.services.backtesting.strategies.composed_signal.ComposedSignalStrategy.get_daily_recommendation",
        lambda self, input_data: StrategyAction(
            snapshot=_hold_rotation_snapshot(
                signal=_default_signal(),
                transfers=[
                    TransferIntent(
                        from_bucket="btc",
                        to_bucket="eth",
                        amount_usd=750.0,
                    )
                ],
            )
        ),
    )

    mocks["landing_page_service"].get_landing_page_data = (
        lambda _user_id: mock_portfolio(btc=6_000.0, eth=1_000.0, stable=3_000.0)
    )
    mocks["token_price_service"].get_latest_price = lambda _symbol: SimpleNamespace(
        date="2025-01-10", price_usd=100_000.0
    )

    def _price_history(**kwargs):
        token_symbol = kwargs["token_symbol"]
        if token_symbol == "ETH":
            return [SimpleNamespace(date="2025-01-10", price_usd=3_000.0)]
        return [SimpleNamespace(date="2025-01-10", price_usd=100_000.0)]

    mocks["token_price_service"].get_price_history = _price_history
    mocks["token_price_service"].get_dma_history = lambda **_: {
        date(2025, 1, 10): 95_000.0
    }
    mocks["token_price_service"].get_pair_ratio_dma_history = lambda **_: {
        date(2025, 1, 10): {
            "ratio": 0.03,
            "dma_200": 0.028,
            "is_above_dma": True,
        }
    }
    mocks["sentiment_service"].get_current_sentiment_sync = lambda: SimpleNamespace(
        status="Greed", value=72
    )
    mocks["sentiment_service"].get_daily_sentiment_aggregates = lambda **_: []

    response = service.get_daily_suggestion(
        UUID(int=10), config_id="eth_btc_rotation_default"
    )

    assert response.context.strategy.stance == "hold"
    assert response.action.status == "action_required"
    assert response.action.required is True
    assert response.action.kind == "rebalance"
    assert response.action.transfers
    assert response.action.reason_code == "eth_btc_ratio_rebalance"


def test_get_daily_suggestion_marks_hold_rotation_cooldown_as_blocked(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, mocks = _service()
    mocks["strategy_config_store"].resolve_config = (
        lambda _config_id: resolve_seed_strategy_config("eth_btc_rotation_default")
    )

    monkeypatch.setattr(
        "src.services.backtesting.strategies.composed_signal.ComposedSignalStrategy.get_daily_recommendation",
        lambda self, input_data: StrategyAction(
            snapshot=_hold_rotation_snapshot(
                signal=_default_signal(),
                blocked_reason="eth_btc_ratio_cooldown_active",
            )
        ),
    )

    mocks["landing_page_service"].get_landing_page_data = (
        lambda _user_id: mock_portfolio(btc=6_000.0, eth=1_000.0, stable=3_000.0)
    )
    mocks["token_price_service"].get_latest_price = lambda _symbol: SimpleNamespace(
        date="2025-01-10", price_usd=100_000.0
    )

    def _price_history(**kwargs):
        token_symbol = kwargs["token_symbol"]
        if token_symbol == "ETH":
            return [SimpleNamespace(date="2025-01-10", price_usd=3_000.0)]
        return [SimpleNamespace(date="2025-01-10", price_usd=100_000.0)]

    mocks["token_price_service"].get_price_history = _price_history
    mocks["token_price_service"].get_dma_history = lambda **_: {
        date(2025, 1, 10): 95_000.0
    }
    mocks["token_price_service"].get_pair_ratio_dma_history = lambda **_: {
        date(2025, 1, 10): {
            "ratio": 0.03,
            "dma_200": 0.028,
            "is_above_dma": True,
        }
    }
    mocks["sentiment_service"].get_current_sentiment_sync = lambda: SimpleNamespace(
        status="Greed", value=72
    )
    mocks["sentiment_service"].get_daily_sentiment_aggregates = lambda **_: []

    response = service.get_daily_suggestion(
        UUID(int=11), config_id="eth_btc_rotation_default"
    )

    assert response.context.strategy.stance == "hold"
    assert response.action.status == "blocked"
    assert response.action.required is False
    assert response.action.kind is None
    assert response.action.transfers == []
    assert response.action.reason_code == "eth_btc_ratio_cooldown_active"


def test_get_daily_suggestion_applies_trade_quota_history() -> None:
    service, mocks = _service()
    quota_config = build_saved_config_from_legacy(
        strategy_id="dma_gated_fgi",
        params={"min_trade_interval_days": 3},
        config_id="dma_quota_live",
    )
    mocks["strategy_config_store"].resolve_config = lambda _config_id: quota_config
    service.trade_history_store = SimpleNamespace(
        list_trade_dates=lambda *_args, **_kwargs: [date(2025, 1, 9)]
    )
    mocks["landing_page_service"].get_landing_page_data = (
        lambda _user_id: mock_portfolio(btc=2_500.0, stable=7_500.0)
    )
    mocks["token_price_service"].get_latest_price = lambda _symbol: SimpleNamespace(
        date="2025-01-10", price_usd=100_000.0
    )
    mocks["token_price_service"].get_price_history = lambda **_: [
        SimpleNamespace(date="2025-01-09", price_usd=99_000.0),
        SimpleNamespace(date="2025-01-10", price_usd=100_000.0),
    ]
    mocks["token_price_service"].get_dma_history = lambda **_: {
        date(2025, 1, 9): 95_000.0,
        date(2025, 1, 10): 95_000.0,
    }
    mocks["sentiment_service"].get_current_sentiment_sync = lambda: SimpleNamespace(
        status="Greed", value=72
    )
    mocks["sentiment_service"].get_daily_sentiment_aggregates = lambda **_: [
        {"date": date(2025, 1, 9), "label": "neutral", "value": 55},
        {"date": date(2025, 1, 10), "label": "greed", "value": 72},
    ]

    response = service.get_daily_suggestion(UUID(int=7), config_id="dma_quota_live")

    assert response.action.status == "blocked"
    assert response.action.required is False
    assert response.action.kind is None
    assert response.action.reason_code == "trade_quota_min_interval_active"


def test_get_daily_suggestion_uses_store_default_config_when_config_id_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, mocks = _service()
    custom_default = resolve_seed_strategy_config("dma_gated_fgi_default").model_copy(
        update={
            "config_id": "dma_alt_default",
            "display_name": "DMA Alt Default",
            "is_default": True,
        },
        deep=True,
    )
    mocks["strategy_config_store"].resolve_config = lambda _config_id: custom_default

    monkeypatch.setattr(
        "src.services.backtesting.strategies.composed_signal.ComposedSignalStrategy.get_daily_recommendation",
        lambda self, input_data: StrategyAction(
            snapshot=_sell_snapshot(signal=_default_signal())
        ),
    )
    mocks["landing_page_service"].get_landing_page_data = (
        lambda _user_id: mock_portfolio(btc=2_500.0, stable=7_500.0)
    )
    mocks["token_price_service"].get_latest_price = lambda _symbol: SimpleNamespace(
        date="2025-01-10", price_usd=100_000.0
    )
    mocks["token_price_service"].get_price_history = lambda **_: [
        SimpleNamespace(date="2025-01-10", price_usd=100_000.0)
    ]
    mocks["token_price_service"].get_dma_history = lambda **_: {
        date(2025, 1, 10): 95_000.0
    }
    mocks["sentiment_service"].get_current_sentiment_sync = lambda: SimpleNamespace(
        status="Greed", value=72
    )
    mocks["sentiment_service"].get_daily_sentiment_aggregates = lambda **_: []

    response = service.get_daily_suggestion(UUID(int=6))

    assert response.config_id == "dma_alt_default"


def test_get_daily_suggestion_uses_recipe_capabilities(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, mocks = _service()
    recipe = replace(
        get_strategy_recipe("dma_gated_fgi"),
        primary_asset="ETH",
        portfolio_bucket_mapper=lambda _portfolio: PortfolioBuckets(
            spot_value=1_000.0,
            stable_value=9_000.0,
        ),
    )
    base_config = resolve_seed_strategy_config("dma_gated_fgi_default")
    mocks["strategy_config_store"].resolve_config = (
        lambda _config_id: base_config.model_copy(
            update={"config_id": "eth_dma", "primary_asset": "ETH"}
        )
    )
    monkeypatch.setattr(
        "src.services.strategy.strategy_daily_suggestion_service.resolve_saved_strategy_config",
        lambda _saved_config, **_: SimpleNamespace(
            strategy_id=recipe.strategy_id,
            display_name="ETH DMA",
            primary_asset="ETH",
            market_data_requirements=recipe.market_data_requirements,
            warmup_lookback_days=recipe.warmup_lookback_days,
            portfolio_bucket_mapper=recipe.portfolio_bucket_mapper,
            runtime_portfolio_mode=recipe.runtime_portfolio_mode,
            build_strategy=recipe.build_strategy,
            summary_signal_id=recipe.signal_id,
            public_params={"cross_cooldown_days": 30},
            supports_daily_suggestion=True,
        ),
    )

    def _fake_daily_recommendation(self, input_data):
        assert input_data.price == 3_000.0
        return StrategyAction(snapshot=_sell_snapshot(signal=_default_signal()))

    monkeypatch.setattr(
        "src.services.backtesting.strategies.composed_signal.ComposedSignalStrategy.get_daily_recommendation",
        _fake_daily_recommendation,
    )

    mocks["landing_page_service"].get_landing_page_data = (
        lambda _user_id: mock_portfolio(btc=2_500.0, stable=7_500.0)
    )
    mocks["token_price_service"].get_latest_price = lambda symbol: (
        SimpleNamespace(date="2025-01-10", price_usd=3_000.0)
        if symbol == "ETH"
        else None
    )
    mocks["token_price_service"].get_price_history = lambda **kwargs: (
        [SimpleNamespace(date="2025-01-10", price_usd=3_000.0)]
        if kwargs["token_symbol"] == "ETH"
        else []
    )
    mocks["token_price_service"].get_dma_history = lambda **kwargs: (
        {date(2025, 1, 10): 2_900.0} if kwargs["token_symbol"] == "ETH" else {}
    )
    mocks["sentiment_service"].get_current_sentiment_sync = lambda: SimpleNamespace(
        status="Greed", value=72
    )
    mocks["sentiment_service"].get_daily_sentiment_aggregates = lambda **_: []

    response = service.get_daily_suggestion(UUID(int=5))

    assert response.context.market.token_price == {"eth": 3_000.0}
    assert response.context.portfolio.allocation.spot == pytest.approx(0.1)
    assert response.context.portfolio.allocation.stable == pytest.approx(0.9)
    assert response.context.portfolio.asset_allocation.btc == pytest.approx(0.0)
    assert response.context.portfolio.asset_allocation.eth == pytest.approx(0.1)
    assert response.context.portfolio.asset_allocation.stable == pytest.approx(0.9)
    assert response.context.portfolio.asset_allocation.alt == pytest.approx(0.0)
    assert response.context.target.allocation.btc == pytest.approx(0.0)
    assert response.context.target.allocation.eth == pytest.approx(0.0)
    assert response.context.target.allocation.stable == pytest.approx(1.0)
    assert response.context.target.allocation.alt == pytest.approx(0.0)


def test_get_daily_suggestion_requires_serialized_signal(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, mocks = _service()
    mocks["strategy_config_store"].resolve_config = (
        lambda _config_id: resolve_seed_strategy_config("dma_gated_fgi_default")
    )

    def _missing_signal(self, _input_data):
        return StrategyAction(snapshot=_sell_snapshot(signal=None))

    monkeypatch.setattr(
        "src.services.backtesting.strategies.composed_signal.ComposedSignalStrategy.get_daily_recommendation",
        _missing_signal,
    )
    mocks["landing_page_service"].get_landing_page_data = (
        lambda _user_id: mock_portfolio(stable=10_000.0)
    )
    mocks["token_price_service"].get_latest_price = lambda _symbol: SimpleNamespace(
        date="2025-01-10", price_usd=100_000.0
    )
    mocks["token_price_service"].get_price_history = lambda **_: [
        SimpleNamespace(date="2025-01-10", price_usd=100_000.0)
    ]
    mocks["token_price_service"].get_dma_history = lambda **_: {
        date(2025, 1, 10): 95_000.0
    }
    mocks["sentiment_service"].get_current_sentiment_sync = lambda: SimpleNamespace(
        status="Greed", value=72
    )
    mocks["sentiment_service"].get_daily_sentiment_aggregates = lambda **_: []

    with pytest.raises(
        ValueError, match="Daily suggestion serialization missing signal state"
    ):
        service.get_daily_suggestion(UUID(int=4))


def test_load_market_data_missing_price_raises() -> None:
    """Cover line 173: latest_price is None raises ValueError."""
    from src.services.backtesting.features import MarketDataRequirements

    service, mocks = _service()
    mocks["token_price_service"].get_latest_price = lambda _: None

    resolved_config = SimpleNamespace(
        primary_asset="BTC",
        market_data_requirements=MarketDataRequirements(),
    )

    with pytest.raises(ValueError, match="Missing latest BTC price"):
        service._load_market_data(resolved_config=resolved_config, lookback_days=90)


def test_build_price_map_includes_eth_price() -> None:
    """Cover line 380: eth_price is not None adds eth to price_map."""
    result = StrategyDailySuggestionService._build_price_map(
        primary_asset="BTC",
        primary_price=50_000.0,
        feature_row={"eth_price_usd": 3_000.0},
    )
    assert result == {"btc": 50_000.0, "eth": 3_000.0}


def test_build_price_map_without_eth_price() -> None:
    """When no eth_price_usd in feature_row, price_map only has primary."""
    result = StrategyDailySuggestionService._build_price_map(
        primary_asset="BTC",
        primary_price=50_000.0,
        feature_row={},
    )
    assert result == {"btc": 50_000.0}
    assert "eth" not in result
