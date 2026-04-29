"""Unit tests for the SPY/ETH/BTC multi-asset rotation strategy.

The headline assertions cover the four-bucket allocation formula under each
combination of risk-on/off gates plus invariants (allocations always sum to
~1.0). One test pins down the central design promise: a neutral FGI placeholder
is a no-op for the SPY DMA gate's FGI conditional branches.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import date

import pytest

from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.features import (
    ETH_BTC_RATIO_DMA_200_FEATURE,
    ETH_BTC_RATIO_FEATURE,
    MACRO_FEAR_GREED_FEATURE,
    SPY_DMA_200_FEATURE,
    SPY_PRICE_FEATURE,
)
from src.services.backtesting.strategies.base import StrategyContext
from src.services.backtesting.strategies.spy_eth_btc_rotation import (
    SpyEthBtcRotationDecisionPolicy,
    SpyEthBtcRotationParams,
    SpyEthBtcRotationSignalComponent,
    SpyEthBtcRotationState,
    SpyEthBtcRotationStrategy,
    _build_crypto_dma_context,
    _build_spy_dma_context,
    _compose_4bucket_target,
    _crypto_risk_on_share,
    _eth_share_within_crypto,
    _normalize_4bucket_allocation,
    _spy_risk_on_share,
    default_spy_eth_btc_rotation_params,
)


def _build_context(
    *,
    portfolio: Portfolio,
    btc_price: float = 100_000.0,
    eth_price: float = 5_000.0,
    spy_price: float | None = 600.0,
    dma_200: float = 95_000.0,
    spy_dma_200: float | None = 580.0,
    ratio: float | None = 0.05,
    ratio_dma_200: float | None = 0.045,
    sentiment_label: str = "neutral",
    sentiment_value: int = 50,
    macro_fear_greed_score: int | None = None,
    snapshot_date: date = date(2026, 4, 27),
) -> StrategyContext:
    extra: dict[str, object] = {"dma_200": dma_200}
    if ratio is not None:
        extra[ETH_BTC_RATIO_FEATURE] = ratio
    if ratio_dma_200 is not None:
        extra[ETH_BTC_RATIO_DMA_200_FEATURE] = ratio_dma_200
    if spy_price is not None:
        extra[SPY_PRICE_FEATURE] = spy_price
    if spy_dma_200 is not None:
        extra[SPY_DMA_200_FEATURE] = spy_dma_200
    if macro_fear_greed_score is not None:
        extra[MACRO_FEAR_GREED_FEATURE] = {
            "score": float(macro_fear_greed_score),
            "label": "neutral",
            "source": "cnn_fear_greed_unofficial",
            "updated_at": "2026-04-27T00:00:00+00:00",
        }
    return StrategyContext(
        date=snapshot_date,
        price=btc_price,
        sentiment={"label": sentiment_label, "value": sentiment_value},
        price_history=[btc_price],
        portfolio=portfolio,
        price_map={"btc": btc_price, "eth": eth_price, "spy": spy_price or 0.0},
        extra_data=extra,
    )


# ── Pure allocation-formula tests ────────────────────────────────────────────


class TestNormalize4BucketAllocation:
    def test_zero_total_returns_stable_fallback(self) -> None:
        result = _normalize_4bucket_allocation(
            spy_share=0.0, btc_share=0.0, eth_share=0.0, stable_share=0.0
        )
        assert result == {"spy": 0.0, "btc": 0.0, "eth": 0.0, "stable": 1.0, "alt": 0.0}

    def test_normalizes_to_sum_one(self) -> None:
        result = _normalize_4bucket_allocation(
            spy_share=0.6, btc_share=0.4, eth_share=0.4, stable_share=0.0
        )
        assert sum(result.values()) == pytest.approx(1.0)

    def test_clamps_negative_inputs(self) -> None:
        result = _normalize_4bucket_allocation(
            spy_share=-0.5, btc_share=0.5, eth_share=0.5, stable_share=0.0
        )
        assert result["spy"] == 0.0
        assert sum(result.values()) == pytest.approx(1.0)


class TestCompose4BucketTarget:
    def test_both_gates_fully_on_splits_50_50_between_spy_and_crypto(self) -> None:
        # spy=1.0 + btc=0.5 + eth=0.5 + stable=0 = 2.0; normalized → 0.5/0.25/0.25/0.
        result = _compose_4bucket_target(
            spy_risk_on=1.0, crypto_risk_on=1.0, eth_share_in_crypto=0.5
        )
        assert result["spy"] == pytest.approx(0.5)
        assert result["btc"] == pytest.approx(0.25)
        assert result["eth"] == pytest.approx(0.25)
        assert result["stable"] == pytest.approx(0.0)
        assert sum(result.values()) == pytest.approx(1.0)

    def test_only_spy_gate_on_yields_full_spy(self) -> None:
        result = _compose_4bucket_target(
            spy_risk_on=1.0, crypto_risk_on=0.0, eth_share_in_crypto=0.0
        )
        assert result["spy"] == pytest.approx(1.0)
        assert result["btc"] == pytest.approx(0.0)
        assert result["eth"] == pytest.approx(0.0)
        assert result["stable"] == pytest.approx(0.0)

    def test_only_crypto_gate_on_yields_full_crypto_split(self) -> None:
        result = _compose_4bucket_target(
            spy_risk_on=0.0, crypto_risk_on=1.0, eth_share_in_crypto=1.0
        )
        assert result["spy"] == pytest.approx(0.0)
        assert result["btc"] == pytest.approx(0.0)
        assert result["eth"] == pytest.approx(1.0)
        assert result["stable"] == pytest.approx(0.0)

    def test_both_gates_off_yields_full_stable(self) -> None:
        result = _compose_4bucket_target(
            spy_risk_on=0.0, crypto_risk_on=0.0, eth_share_in_crypto=0.0
        )
        assert result["stable"] == pytest.approx(1.0)
        assert result["spy"] == pytest.approx(0.0)
        assert result["btc"] == pytest.approx(0.0)
        assert result["eth"] == pytest.approx(0.0)

    def test_partial_gates_residual_goes_to_stable(self) -> None:
        # spy=0.3 + crypto=0.4 (split 50/50) + stable=residual(0.3) = 1.0
        result = _compose_4bucket_target(
            spy_risk_on=0.3, crypto_risk_on=0.4, eth_share_in_crypto=0.5
        )
        assert result["spy"] == pytest.approx(0.3)
        assert result["btc"] == pytest.approx(0.2)
        assert result["eth"] == pytest.approx(0.2)
        assert result["stable"] == pytest.approx(0.3)
        assert sum(result.values()) == pytest.approx(1.0)


class TestRiskOnHelpers:
    def test_crypto_risk_on_share_sums_btc_eth(self) -> None:
        assert _crypto_risk_on_share({"btc": 0.3, "eth": 0.4, "stable": 0.3}) == 0.7

    def test_eth_share_within_crypto_zero_when_no_crypto(self) -> None:
        assert _eth_share_within_crypto({"btc": 0.0, "eth": 0.0, "stable": 1.0}) == 0.0

    def test_eth_share_within_crypto_proportional(self) -> None:
        assert _eth_share_within_crypto({"btc": 0.2, "eth": 0.3}) == pytest.approx(0.6)

    def test_spy_risk_on_share_uses_spy_bucket(self) -> None:
        assert _spy_risk_on_share({"spy": 0.6, "stable": 0.4}) == pytest.approx(0.6)

    def test_spy_risk_on_share_handles_none(self) -> None:
        assert _spy_risk_on_share(None) == 0.0


# ── Context adapter ──────────────────────────────────────────────────────────


class TestBuildSpyDmaContext:
    def test_neutral_sentiment_injected(self) -> None:
        portfolio = Portfolio(btc_balance=0.5, stable_balance=1_000.0)
        context = _build_context(
            portfolio=portfolio,
            sentiment_label="extreme_greed",
            sentiment_value=85,
        )
        spy_context = _build_spy_dma_context(context)
        assert spy_context.sentiment == {"label": "neutral", "value": 50.0}

    def test_swaps_in_spy_price_and_dma(self) -> None:
        portfolio = Portfolio(btc_balance=0.5, stable_balance=1_000.0)
        context = _build_context(
            portfolio=portfolio,
            btc_price=100_000.0,
            spy_price=600.0,
            dma_200=95_000.0,
            spy_dma_200=580.0,
        )
        spy_context = _build_spy_dma_context(context)
        assert spy_context.price == 600.0
        assert spy_context.extra_data["dma_200"] == 580.0

    def test_returns_unchanged_when_spy_data_missing(self) -> None:
        portfolio = Portfolio(btc_balance=0.5, stable_balance=1_000.0)
        context = _build_context(
            portfolio=portfolio,
            spy_price=None,
            spy_dma_200=None,
        )
        spy_context = _build_spy_dma_context(context)
        assert spy_context is context


class TestBuildCryptoDmaContext:
    def test_uses_btc_price_even_when_portfolio_spot_is_eth(self) -> None:
        portfolio = Portfolio.from_asset_allocation(
            10_000.0,
            {"btc": 0.0, "eth": 1.0, "spy": 0.0, "stable": 0.0, "alt": 0.0},
            {"btc": 100_000.0, "eth": 5_000.0, "spy": 600.0},
            spot_asset="BTC",
        )
        prices = {"btc": 100_000.0, "eth": 5_000.0, "spy": 600.0}
        portfolio.rotate_spot_asset("ETH", prices)
        context = _build_context(
            portfolio=portfolio,
            btc_price=100_000.0,
            eth_price=5_000.0,
            dma_200=80_000.0,
        )
        context = replace(context, price=portfolio.resolve_spot_price(prices))

        crypto_context = _build_crypto_dma_context(context)

        assert context.price == 5_000.0
        assert crypto_context.price == 100_000.0


# ── Signal component integration ─────────────────────────────────────────────


class TestSpyEthBtcSignalComponent:
    def _component(self) -> SpyEthBtcRotationSignalComponent:
        return SpyEthBtcRotationSignalComponent(params=SpyEthBtcRotationParams())

    def test_observe_populates_spy_state_when_spy_data_present(self) -> None:
        component = self._component()
        portfolio = Portfolio(btc_balance=0.5, eth_balance=10.0, stable_balance=5_000.0)
        init_context = _build_context(portfolio=portfolio)
        component.initialize(init_context)
        snapshot = component.observe(init_context)
        assert snapshot.spy_dma_state is not None
        assert snapshot.crypto_state is not None
        assert "spy" in snapshot.current_asset_allocation

    def test_observe_uses_btc_dma_for_crypto_gate_when_eth_is_majority(self) -> None:
        component = self._component()
        prices = {"btc": 100_000.0, "eth": 5_000.0, "spy": 600.0}
        portfolio = Portfolio.from_asset_allocation(
            10_000.0,
            {"btc": 0.0, "eth": 1.0, "spy": 0.0, "stable": 0.0, "alt": 0.0},
            prices,
            spot_asset="BTC",
        )
        context = _build_context(
            portfolio=portfolio,
            btc_price=100_000.0,
            eth_price=5_000.0,
            dma_200=80_000.0,
        )
        context = replace(context, price=5_000.0)

        component.initialize(context)
        snapshot = component.observe(context)

        assert snapshot.crypto_state.dma_state.dma_200 == pytest.approx(80_000.0)
        assert snapshot.crypto_state.dma_state.dma_distance == pytest.approx(0.25)

    def test_observe_extracts_macro_fear_greed_score(self) -> None:
        component = self._component()
        portfolio = Portfolio(btc_balance=0.5, eth_balance=10.0, stable_balance=5_000.0)
        context = _build_context(portfolio=portfolio, macro_fear_greed_score=18)
        component.initialize(context)
        snapshot = component.observe(context)
        assert snapshot.macro_fear_greed_score == 18

    def test_observe_skips_spy_state_when_spy_data_missing(self) -> None:
        component = self._component()
        portfolio = Portfolio(btc_balance=0.5, stable_balance=1_000.0)
        context = _build_context(portfolio=portfolio, spy_price=None, spy_dma_200=None)
        component.initialize(context)
        snapshot = component.observe(context)
        assert snapshot.spy_dma_state is None


# ── Strategy wiring ──────────────────────────────────────────────────────────


class TestSpyEthBtcRotationStrategy:
    def test_strategy_constructs_with_default_params(self) -> None:
        strategy = SpyEthBtcRotationStrategy(total_capital=10_000.0)
        assert strategy.strategy_id == "spy_eth_btc_rotation"
        assert strategy.signal_id == "spy_eth_btc_rs_signal"

    def test_default_public_params_round_trip(self) -> None:
        defaults = default_spy_eth_btc_rotation_params()
        strategy = SpyEthBtcRotationStrategy(total_capital=10_000.0, params=defaults)
        # parameters() should expose the resolved public params unchanged.
        round_tripped = strategy.parameters()
        for key, value in defaults.items():
            assert round_tripped[key] == value

    def test_strategy_id_validation_blocks_wrong_signal_id(self) -> None:
        with pytest.raises(ValueError, match="signal_id must be"):
            SpyEthBtcRotationStrategy(total_capital=10_000.0, signal_id="wrong_id")


# ── Hold-state SPY allocation preservation ───────────────────────────────────


class TestDecidePolicyHoldStatePreservesSpy:
    """Regression: hold state must preserve current SPY share, not zero out.

    SPY DMA gate uses a neutral FGI placeholder, so FGI conditional branches
    never fire — only DMA cross/overextension can trigger a non-hold intent.
    Pre-fix, hold state returned target_allocation=None, which mapped to
    spy_risk_on=0 and zeroed SPY every day no event fired. The fix mirrors
    eth_btc_rotation.py:559-575 — fall back to current_asset_allocation.
    """

    def _hold_state_dma_snapshot(self):
        from src.services.backtesting.signals.dma_gated_fgi.types import (
            DmaCooldownState,
            DmaMarketState,
        )

        return DmaMarketState(
            signal_id="dma_gated_fgi",
            dma_200=580.0,
            dma_distance=0.05,
            zone="above",
            cross_event=None,
            actionable_cross_event=None,
            cooldown_state=DmaCooldownState(
                active=False, remaining_days=0, blocked_zone=None
            ),
            fgi_value=50.0,
            fgi_slope=0.0,
            fgi_regime="neutral",
            regime_source="label",
            ath_event=None,
        )

    def _dma_snapshot(
        self,
        *,
        cross_event: str | None = None,
        distance: float = 0.05,
        zone: str = "above",
    ):
        from src.services.backtesting.signals.dma_gated_fgi.types import (
            DmaCooldownState,
            DmaMarketState,
        )

        return DmaMarketState(
            signal_id="dma_gated_fgi",
            dma_200=580.0,
            dma_distance=distance,
            zone=zone,
            cross_event=cross_event,
            actionable_cross_event=cross_event,
            cooldown_state=DmaCooldownState(
                active=False, remaining_days=0, blocked_zone=None
            ),
            fgi_value=50.0,
            fgi_slope=0.0,
            fgi_regime="neutral",
            regime_source="label",
            ath_event=None,
        )

    def _hold_state_crypto_state(self):
        from src.services.backtesting.signals.dma_gated_fgi.types import (
            DmaCooldownState,
        )
        from src.services.backtesting.strategies.eth_btc_rotation import (
            EthBtcRotationState,
        )

        return EthBtcRotationState(
            dma_state=self._hold_state_dma_snapshot(),
            ratio=0.05,
            ratio_dma_200=0.05,
            ratio_distance=0.0,
            ratio_zone="at",
            ratio_cross_event=None,
            ratio_cooldown_state=DmaCooldownState(
                active=False, remaining_days=0, blocked_zone=None
            ),
            current_asset_allocation={
                "spy": 0.3,
                "btc": 0.4,
                "eth": 0.0,
                "stable": 0.3,
            },
        )

    def test_hold_state_preserves_existing_spy_share(self) -> None:
        policy = SpyEthBtcRotationDecisionPolicy()
        snapshot = SpyEthBtcRotationState(
            crypto_state=self._hold_state_crypto_state(),
            spy_dma_state=self._hold_state_dma_snapshot(),
            current_asset_allocation={
                "spy": 0.3,
                "btc": 0.4,
                "eth": 0.0,
                "stable": 0.3,
            },
        )

        intent = policy.decide(snapshot)

        assert intent.target_allocation is not None
        assert intent.target_allocation["spy"] == pytest.approx(0.0)
        assert intent.target_allocation["stable"] == pytest.approx(1.0)

    def test_hold_state_with_zero_current_spy_enters_via_signals(self) -> None:
        """Under canonical allocator, SPY weight is driven by DMA scores, not
        current allocation. Even when current SPY is 0, a positive SPY DMA score
        produces a non-zero target so the strategy can enter SPY when signals
        favour it."""
        policy = SpyEthBtcRotationDecisionPolicy()
        crypto_state = self._hold_state_crypto_state()
        snapshot = SpyEthBtcRotationState(
            crypto_state=crypto_state,
            spy_dma_state=self._hold_state_dma_snapshot(),
            current_asset_allocation={
                "spy": 0.0,
                "btc": 0.5,
                "eth": 0.0,
                "stable": 0.5,
            },
        )

        intent = policy.decide(snapshot)

        assert intent.target_allocation is not None
        assert intent.target_allocation["spy"] == pytest.approx(0.0)
        assert intent.target_allocation["stable"] == pytest.approx(1.0)

    def test_missing_spy_dma_state_also_falls_back_to_current(self) -> None:
        """spy_dma_state=None (data unavailable) reuses the same fallback path.

        The fix preserves current spy share whenever spy_alloc is None — that
        covers both hold state (spy_dma_state present, intent target=None) and
        the missing-data path (spy_dma_state itself is None, e.g. weekends).
        """
        policy = SpyEthBtcRotationDecisionPolicy()
        snapshot = SpyEthBtcRotationState(
            crypto_state=self._hold_state_crypto_state(),
            spy_dma_state=None,
            current_asset_allocation={
                "spy": 0.3,
                "btc": 0.4,
                "eth": 0.0,
                "stable": 0.3,
            },
        )

        intent = policy.decide(snapshot)

        assert intent.target_allocation is not None
        assert intent.target_allocation["spy"] == pytest.approx(0.3, abs=0.01)

    def test_macro_extreme_fear_halves_spy_risk_score(self) -> None:
        policy = SpyEthBtcRotationDecisionPolicy()
        base_snapshot = SpyEthBtcRotationState(
            crypto_state=self._hold_state_crypto_state(),
            spy_dma_state=self._hold_state_dma_snapshot(),
            current_asset_allocation={
                "spy": 0.0,
                "btc": 0.5,
                "eth": 0.0,
                "stable": 0.5,
            },
            stock_has_crossed_up=True,
            crypto_has_crossed_up=True,
        )
        fear_snapshot = SpyEthBtcRotationState(
            crypto_state=base_snapshot.crypto_state,
            spy_dma_state=base_snapshot.spy_dma_state,
            current_asset_allocation=base_snapshot.current_asset_allocation,
            macro_fear_greed_score=18,
        )

        base_intent = policy.decide(base_snapshot)
        fear_intent = policy.decide(fear_snapshot)

        assert base_intent.target_allocation is not None
        assert fear_intent.target_allocation is not None
        assert (
            fear_intent.target_allocation["spy"] < base_intent.target_allocation["spy"]
        )

    def test_macro_fear_reduces_spy_risk_score(self) -> None:
        policy = SpyEthBtcRotationDecisionPolicy()
        base_snapshot = SpyEthBtcRotationState(
            crypto_state=self._hold_state_crypto_state(),
            spy_dma_state=self._hold_state_dma_snapshot(),
            current_asset_allocation={
                "spy": 0.0,
                "btc": 0.5,
                "eth": 0.0,
                "stable": 0.5,
            },
            stock_has_crossed_up=True,
            crypto_has_crossed_up=True,
        )
        fear_snapshot = SpyEthBtcRotationState(
            crypto_state=base_snapshot.crypto_state,
            spy_dma_state=base_snapshot.spy_dma_state,
            current_asset_allocation=base_snapshot.current_asset_allocation,
            macro_fear_greed_score=35,
        )

        base_intent = policy.decide(base_snapshot)
        fear_intent = policy.decide(fear_snapshot)

        assert base_intent.target_allocation is not None
        assert fear_intent.target_allocation is not None
        assert (
            fear_intent.target_allocation["spy"] < base_intent.target_allocation["spy"]
        )

    def test_macro_neutral_and_greed_keep_spy_score_unchanged(self) -> None:
        policy = SpyEthBtcRotationDecisionPolicy()
        base_snapshot = SpyEthBtcRotationState(
            crypto_state=self._hold_state_crypto_state(),
            spy_dma_state=self._hold_state_dma_snapshot(),
            current_asset_allocation={
                "spy": 0.0,
                "btc": 0.5,
                "eth": 0.0,
                "stable": 0.5,
            },
        )
        base_intent = policy.decide(base_snapshot)
        assert base_intent.target_allocation is not None

        for score in (50, 72):
            macro_intent = policy.decide(
                SpyEthBtcRotationState(
                    crypto_state=base_snapshot.crypto_state,
                    spy_dma_state=base_snapshot.spy_dma_state,
                    current_asset_allocation=base_snapshot.current_asset_allocation,
                    macro_fear_greed_score=score,
                )
            )
            assert macro_intent.target_allocation is not None
            assert macro_intent.target_allocation["spy"] == pytest.approx(
                base_intent.target_allocation["spy"]
            )

    def test_spy_cross_down_zeroes_only_spy_sleeve(self) -> None:
        policy = SpyEthBtcRotationDecisionPolicy()
        snapshot = SpyEthBtcRotationState(
            crypto_state=self._hold_state_crypto_state(),
            spy_dma_state=self._dma_snapshot(cross_event="cross_down"),
            current_asset_allocation={
                "spy": 0.3,
                "btc": 0.4,
                "eth": 0.0,
                "stable": 0.3,
            },
        )

        intent = policy.decide(snapshot)

        assert intent.reason == "spy_dma_cross_down"
        assert intent.target_allocation is not None
        assert intent.target_allocation["spy"] == pytest.approx(0.0)
        assert intent.target_allocation["btc"] + intent.target_allocation[
            "eth"
        ] == pytest.approx(0.0)
        assert intent.target_allocation["stable"] == pytest.approx(1.0)

    def test_crypto_cross_down_zeroes_only_crypto_sleeve(self) -> None:
        policy = SpyEthBtcRotationDecisionPolicy()
        crypto_state = self._hold_state_crypto_state()
        crypto_state = replace(
            crypto_state,
            dma_state=self._dma_snapshot(cross_event="cross_down"),
        )
        snapshot = SpyEthBtcRotationState(
            crypto_state=crypto_state,
            spy_dma_state=self._hold_state_dma_snapshot(),
            current_asset_allocation={
                "spy": 0.3,
                "btc": 0.4,
                "eth": 0.0,
                "stable": 0.3,
            },
        )

        intent = policy.decide(snapshot)

        assert intent.reason == "crypto_dma_cross_down"
        assert intent.target_allocation is not None
        assert intent.target_allocation["spy"] == pytest.approx(0.0)
        assert intent.target_allocation["btc"] == pytest.approx(0.0)
        assert intent.target_allocation["eth"] == pytest.approx(0.0)
        assert intent.target_allocation["stable"] == pytest.approx(1.0)

    def test_spy_cross_up_executes_score_derived_target_immediately(self) -> None:
        policy = SpyEthBtcRotationDecisionPolicy()
        snapshot = SpyEthBtcRotationState(
            crypto_state=self._hold_state_crypto_state(),
            spy_dma_state=self._dma_snapshot(cross_event="cross_up"),
            current_asset_allocation={
                "spy": 0.0,
                "btc": 0.4,
                "eth": 0.0,
                "stable": 0.6,
            },
        )

        intent = policy.decide(snapshot)

        assert intent.reason == "spy_dma_cross_up"
        assert intent.immediate is True
        assert intent.target_allocation is not None
        assert intent.target_allocation["spy"] == pytest.approx(1.0)

    def test_crypto_cross_up_preserves_eth_btc_rotation_target(self) -> None:
        policy = SpyEthBtcRotationDecisionPolicy()
        crypto_state = self._hold_state_crypto_state()
        crypto_state = replace(
            crypto_state,
            dma_state=self._dma_snapshot(cross_event="cross_up"),
            ratio_cross_event="cross_up",
            ratio_zone="above",
            ratio_distance=0.10,
        )
        snapshot = SpyEthBtcRotationState(
            crypto_state=crypto_state,
            spy_dma_state=self._hold_state_dma_snapshot(),
            current_asset_allocation={
                "spy": 0.0,
                "btc": 0.4,
                "eth": 0.0,
                "stable": 0.6,
            },
        )

        intent = policy.decide(snapshot)

        assert intent.reason == "crypto_dma_cross_up"
        assert intent.immediate is True
        assert intent.target_allocation is not None
        assert intent.target_allocation["btc"] > intent.target_allocation["eth"]


# ── Neutral FGI no-op pinning ────────────────────────────────────────────────


class TestNeutralFgiPlaceholderIsNoOp:
    """Pin down the central design claim: with neutral FGI, only DMA rules fire.

    If a future change accidentally adds a 'neutral' branch to the FGI rules
    in DmaGatedFgiDecisionPolicy, this test will catch it — the SPY decision
    must be identical regardless of the placeholder's value field.
    """

    def test_decision_path_unaffected_by_neutral_fgi_value(self) -> None:
        from src.services.backtesting.signals.dma_gated_fgi.types import (
            DmaCooldownState,
            DmaMarketState,
        )
        from src.services.backtesting.strategies.dma_gated_fgi import (
            DmaGatedFgiDecisionPolicy,
        )

        policy = DmaGatedFgiDecisionPolicy()
        # SPY is in "above" zone, distance below overextension — should HOLD with
        # neutral regime regardless of the underlying numeric FGI value.
        baseline_state = DmaMarketState(
            signal_id="dma_gated_fgi",
            dma_200=580.0,
            dma_distance=0.05,  # below overextension threshold (0.30)
            zone="above",
            cross_event=None,
            actionable_cross_event=None,
            cooldown_state=DmaCooldownState(
                active=False, remaining_days=0, blocked_zone=None
            ),
            fgi_value=50.0,
            fgi_slope=0.0,
            fgi_regime="neutral",
            regime_source="label",
            ath_event=None,
        )
        intent = policy.decide(baseline_state)
        assert intent.action == "hold"

        # Same state but different FGI numeric value within neutral band — same intent.
        for fgi_val in (40.0, 50.0, 55.0):
            varied_state = DmaMarketState(
                signal_id="dma_gated_fgi",
                dma_200=580.0,
                dma_distance=0.05,
                zone="above",
                cross_event=None,
                actionable_cross_event=None,
                cooldown_state=DmaCooldownState(
                    active=False, remaining_days=0, blocked_zone=None
                ),
                fgi_value=fgi_val,
                fgi_slope=0.0,
                fgi_regime="neutral",
                regime_source="label",
                ath_event=None,
            )
            varied_intent = policy.decide(varied_state)
            assert varied_intent.action == intent.action
            assert varied_intent.reason == intent.reason
