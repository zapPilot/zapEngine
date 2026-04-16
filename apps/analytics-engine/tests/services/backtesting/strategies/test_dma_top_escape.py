"""Tests for the top-escape indicators: DMA overextension and FGI slope reversal."""

from __future__ import annotations

from datetime import date

import pytest
from pydantic import ValidationError

from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.signals.dma_gated_fgi.types import (
    DmaCooldownState,
    DmaMarketState,
)
from src.services.backtesting.strategies.base import StrategyContext
from src.services.backtesting.strategies.dma_gated_fgi import (
    DmaGatedFgiStrategy,
    _resolve_dma_allocation_intent,
)


def _snapshot(
    *,
    zone: str = "above",
    dma_distance: float = 0.10,
    fgi_regime: str = "neutral",
    fgi_slope: float = 0.0,
    ath_event: str | None = None,
    cross_event: str | None = None,
    actionable_cross_event: str | None = None,
    cooldown_active: bool = False,
    cooldown_blocked_zone: str | None = None,
) -> DmaMarketState:
    return DmaMarketState(
        signal_id="dma_gated_fgi",
        dma_200=100_000.0,
        dma_distance=dma_distance,
        zone=zone,
        cross_event=cross_event,
        actionable_cross_event=actionable_cross_event,
        cooldown_state=DmaCooldownState(
            active=cooldown_active,
            remaining_days=10 if cooldown_active else 0,
            blocked_zone=cooldown_blocked_zone,
        ),
        fgi_value=50.0,
        fgi_slope=fgi_slope,
        fgi_regime=fgi_regime,
        regime_source="label",
        ath_event=ath_event,
    )


# ── DMA Overextension ────────────────────────────────────────────────


def test_dma_overextended_sell_fires_at_30pct() -> None:
    intent = _resolve_dma_allocation_intent(
        _snapshot(zone="above", dma_distance=0.35),
    )
    assert intent.action == "sell"
    assert intent.reason == "above_dma_overextended_sell"
    assert intent.decision_score == pytest.approx(-0.8)
    assert intent.rule_group == "dma_fgi"


def test_dma_overextended_sell_fires_at_exact_threshold() -> None:
    intent = _resolve_dma_allocation_intent(
        _snapshot(zone="above", dma_distance=0.30),
    )
    assert intent.action == "sell"
    assert intent.reason == "above_dma_overextended_sell"


def test_dma_overextended_sell_does_not_fire_below_threshold() -> None:
    intent = _resolve_dma_allocation_intent(
        _snapshot(zone="above", dma_distance=0.25, fgi_regime="neutral"),
    )
    assert intent.reason != "above_dma_overextended_sell"
    assert intent.action == "hold"


def test_dma_overextended_sell_does_not_fire_below_zone() -> None:
    intent = _resolve_dma_allocation_intent(
        _snapshot(zone="below", dma_distance=0.35),
    )
    assert intent.reason != "above_dma_overextended_sell"


def test_dma_overextended_sell_uses_custom_threshold() -> None:
    intent = _resolve_dma_allocation_intent(
        _snapshot(zone="above", dma_distance=0.45),
        dma_overextension_threshold=0.50,
    )
    assert intent.reason != "above_dma_overextended_sell"

    intent = _resolve_dma_allocation_intent(
        _snapshot(zone="above", dma_distance=0.55),
        dma_overextension_threshold=0.50,
    )
    assert intent.reason == "above_dma_overextended_sell"


def test_dma_overextended_has_higher_priority_than_extreme_greed() -> None:
    intent = _resolve_dma_allocation_intent(
        _snapshot(zone="above", dma_distance=0.35, fgi_regime="extreme_greed"),
    )
    assert intent.reason == "above_dma_overextended_sell"
    assert intent.decision_score == pytest.approx(-0.8)


def test_dma_overextended_does_not_override_cross_down() -> None:
    intent = _resolve_dma_allocation_intent(
        _snapshot(
            zone="above",
            dma_distance=0.35,
            cross_event="cross_down",
            actionable_cross_event="cross_down",
        ),
    )
    assert intent.reason == "dma_cross_down"


# ── FGI Slope Reversal ───────────────────────────────────────────────


def test_greed_fading_sell_fires_on_negative_slope_in_greed() -> None:
    intent = _resolve_dma_allocation_intent(
        _snapshot(
            zone="above",
            fgi_regime="greed",
            fgi_slope=-0.08,
            dma_distance=0.15,
        ),
    )
    assert intent.action == "sell"
    assert intent.reason == "above_greed_fading_sell"
    assert intent.decision_score == pytest.approx(-0.6)
    assert intent.rule_group == "dma_fgi"


def test_greed_fading_sell_fires_on_negative_slope_in_extreme_greed() -> None:
    """extreme_greed is checked first, but if DMA distance < threshold,
    greed_fading can still fire if slope is negative enough."""
    intent = _resolve_dma_allocation_intent(
        _snapshot(
            zone="above",
            fgi_regime="extreme_greed",
            fgi_slope=-0.08,
            dma_distance=0.15,
        ),
    )
    # extreme_greed fires first because it's before greed_fading in the chain
    assert intent.reason == "above_extreme_greed_sell"


def test_greed_fading_sell_does_not_fire_in_neutral() -> None:
    intent = _resolve_dma_allocation_intent(
        _snapshot(
            zone="above",
            fgi_regime="neutral",
            fgi_slope=-0.08,
            dma_distance=0.15,
        ),
    )
    assert intent.reason != "above_greed_fading_sell"
    assert intent.action == "hold"


def test_greed_fading_sell_does_not_fire_on_positive_slope() -> None:
    intent = _resolve_dma_allocation_intent(
        _snapshot(
            zone="above",
            fgi_regime="greed",
            fgi_slope=0.02,
            dma_distance=0.15,
        ),
    )
    assert intent.reason == "above_greed_sell"  # normal greed sell, not fading


def test_greed_fading_sell_does_not_fire_above_threshold() -> None:
    intent = _resolve_dma_allocation_intent(
        _snapshot(
            zone="above",
            fgi_regime="greed",
            fgi_slope=-0.03,
            dma_distance=0.15,
        ),
    )
    # slope -0.03 > -0.05 threshold, so greed_fading doesn't fire
    assert intent.reason == "above_greed_sell"


def test_greed_fading_sell_does_not_fire_below_zone() -> None:
    intent = _resolve_dma_allocation_intent(
        _snapshot(
            zone="below",
            fgi_regime="greed",
            fgi_slope=-0.08,
            dma_distance=-0.10,
        ),
    )
    assert intent.reason != "above_greed_fading_sell"


def test_greed_fading_sell_uses_custom_threshold() -> None:
    intent = _resolve_dma_allocation_intent(
        _snapshot(
            zone="above",
            fgi_regime="greed",
            fgi_slope=-0.08,
            dma_distance=0.15,
        ),
        fgi_slope_reversal_threshold=-0.10,
    )
    # slope -0.08 > -0.10, so fading doesn't fire with stricter threshold
    assert intent.reason == "above_greed_sell"


# ── Priority ordering ────────────────────────────────────────────────


def test_overextended_takes_priority_over_greed_fading() -> None:
    """When both conditions are met, overextended fires first."""
    intent = _resolve_dma_allocation_intent(
        _snapshot(
            zone="above",
            dma_distance=0.35,
            fgi_regime="greed",
            fgi_slope=-0.08,
        ),
    )
    assert intent.reason == "above_dma_overextended_sell"


def test_greed_fading_takes_priority_over_regular_greed() -> None:
    """When slope is negative enough, greed_fading fires instead of regular greed."""
    intent = _resolve_dma_allocation_intent(
        _snapshot(
            zone="above",
            dma_distance=0.15,
            fgi_regime="greed",
            fgi_slope=-0.08,
        ),
    )
    assert intent.reason == "above_greed_fading_sell"
    assert intent.decision_score == pytest.approx(-0.6)


# ── Full strategy integration tests ─────────────────────────────────


def _make_context(
    *,
    snapshot_date: date,
    price: float,
    dma_200: float,
    sentiment_label: str,
    sentiment_value: int,
    portfolio: Portfolio,
) -> StrategyContext:
    return StrategyContext(
        date=snapshot_date,
        price=price,
        sentiment={"label": sentiment_label, "value": sentiment_value},
        price_history=[price],
        portfolio=portfolio,
        extra_data={"dma_200": dma_200},
    )


def test_overextension_sell_is_paced_not_immediate() -> None:
    """Overextension sell should be paced (step_count > 1), not immediate."""
    strategy = DmaGatedFgiStrategy(total_capital=10_000.0)
    portfolio = Portfolio(spot_balance=10_000.0, stable_balance=0.0)

    warmup_ctx = _make_context(
        snapshot_date=date(2025, 1, 1),
        price=105_000.0,
        dma_200=100_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        portfolio=portfolio,
    )
    strategy.initialize(portfolio, None, warmup_ctx)
    strategy.warmup_day(warmup_ctx)

    live_ctx = _make_context(
        snapshot_date=date(2025, 1, 2),
        price=135_000.0,
        dma_200=100_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        portfolio=portfolio,
    )
    action = strategy.on_day(live_ctx)

    assert action.snapshot is not None
    assert action.snapshot.decision.reason == "above_dma_overextended_sell"
    assert action.snapshot.decision.immediate is False
    assert action.snapshot.execution.step_count > 1


def test_custom_overextension_threshold_via_public_params() -> None:
    """Strategy should accept custom thresholds via params dict."""
    strategy = DmaGatedFgiStrategy(
        total_capital=10_000.0,
        params={"dma_overextension_threshold": 0.50},
    )
    portfolio = Portfolio(spot_balance=10_000.0, stable_balance=0.0)

    warmup_ctx = _make_context(
        snapshot_date=date(2025, 1, 1),
        price=105_000.0,
        dma_200=100_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        portfolio=portfolio,
    )
    strategy.initialize(portfolio, None, warmup_ctx)
    strategy.warmup_day(warmup_ctx)

    # Distance = 40% → below custom threshold of 50%
    ctx_under = _make_context(
        snapshot_date=date(2025, 1, 2),
        price=140_000.0,
        dma_200=100_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        portfolio=portfolio,
    )
    action_under = strategy.on_day(ctx_under)
    assert action_under.snapshot is not None
    assert action_under.snapshot.decision.reason != "above_dma_overextended_sell"

    # Reset and test above threshold
    strategy2 = DmaGatedFgiStrategy(
        total_capital=10_000.0,
        params={"dma_overextension_threshold": 0.50},
    )
    strategy2.initialize(portfolio, None, warmup_ctx)
    strategy2.warmup_day(warmup_ctx)

    # Distance = 55% → above custom threshold of 50%
    ctx_over = _make_context(
        snapshot_date=date(2025, 1, 2),
        price=155_000.0,
        dma_200=100_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        portfolio=portfolio,
    )
    action_over = strategy2.on_day(ctx_over)
    assert action_over.snapshot is not None
    assert action_over.snapshot.decision.reason == "above_dma_overextended_sell"


# ── Edge cases: DMA overextension ────────────────────────────────────


def test_dma_overextended_sell_fires_regardless_of_fgi_regime() -> None:
    """Overextension is a pure price-structure signal — FGI regime doesn't matter."""
    for regime in ("extreme_fear", "fear", "neutral", "greed", "extreme_greed"):
        intent = _resolve_dma_allocation_intent(
            _snapshot(zone="above", dma_distance=0.35, fgi_regime=regime),
        )
        assert intent.reason == "above_dma_overextended_sell", (
            f"Expected overextension sell for regime={regime}"
        )


def test_dma_overextended_sell_does_not_override_cross_up() -> None:
    """Cross events always take priority over overextension."""
    intent = _resolve_dma_allocation_intent(
        _snapshot(
            zone="above",
            dma_distance=0.35,
            cross_event="cross_up",
            actionable_cross_event="cross_up",
        ),
    )
    assert intent.reason == "dma_cross_up"


def test_cooldown_wins_over_overextension() -> None:
    """Cooldown in the above zone blocks overextension sell."""
    intent = _resolve_dma_allocation_intent(
        _snapshot(
            zone="above",
            dma_distance=0.35,
            cooldown_active=True,
            cooldown_blocked_zone="above",
        ),
    )
    assert intent.reason == "above_side_cooldown_active"
    assert intent.action == "hold"


# ── Edge cases: FGI slope reversal ───────────────────────────────────


def test_greed_fading_sell_does_not_fire_at_exact_threshold() -> None:
    """slope < threshold (strict), so slope == -0.05 does NOT fire."""
    intent = _resolve_dma_allocation_intent(
        _snapshot(
            zone="above",
            fgi_regime="greed",
            fgi_slope=-0.05,
            dma_distance=0.15,
        ),
    )
    assert intent.reason == "above_greed_sell"


def test_greed_fading_sell_fires_just_below_threshold() -> None:
    """slope = -0.051 is below -0.05, so fading fires."""
    intent = _resolve_dma_allocation_intent(
        _snapshot(
            zone="above",
            fgi_regime="greed",
            fgi_slope=-0.051,
            dma_distance=0.15,
        ),
    )
    assert intent.reason == "above_greed_fading_sell"


def test_greed_fading_sell_does_not_fire_in_fear() -> None:
    intent = _resolve_dma_allocation_intent(
        _snapshot(
            zone="above",
            fgi_regime="fear",
            fgi_slope=-0.08,
            dma_distance=0.15,
        ),
    )
    assert intent.reason != "above_greed_fading_sell"


def test_greed_fading_sell_does_not_fire_in_extreme_fear() -> None:
    intent = _resolve_dma_allocation_intent(
        _snapshot(
            zone="above",
            fgi_regime="extreme_fear",
            fgi_slope=-0.08,
            dma_distance=0.15,
        ),
    )
    assert intent.reason != "above_greed_fading_sell"


def test_cooldown_wins_over_greed_fading() -> None:
    """Cooldown in the above zone blocks greed-fading sell."""
    intent = _resolve_dma_allocation_intent(
        _snapshot(
            zone="above",
            dma_distance=0.15,
            fgi_regime="greed",
            fgi_slope=-0.08,
            cooldown_active=True,
            cooldown_blocked_zone="above",
        ),
    )
    assert intent.reason == "above_side_cooldown_active"
    assert intent.action == "hold"


# ── Cross-signal interactions ────────────────────────────────────────


def test_overextension_and_fading_both_met_overextension_wins() -> None:
    """When price is overextended AND slope is fading, overextension fires first."""
    intent = _resolve_dma_allocation_intent(
        _snapshot(
            zone="above",
            dma_distance=0.35,
            fgi_regime="greed",
            fgi_slope=-0.10,
        ),
    )
    assert intent.reason == "above_dma_overextended_sell"
    assert intent.decision_score == pytest.approx(-0.8)


def test_fading_with_overextension_below_threshold() -> None:
    """Overextension below threshold → fading still fires independently."""
    intent = _resolve_dma_allocation_intent(
        _snapshot(
            zone="above",
            dma_distance=0.25,
            fgi_regime="greed",
            fgi_slope=-0.10,
        ),
    )
    assert intent.reason == "above_greed_fading_sell"
    assert intent.decision_score == pytest.approx(-0.6)


def test_neither_signal_fires_neutral_above_zone() -> None:
    """Neutral sentiment, moderate distance → hold."""
    intent = _resolve_dma_allocation_intent(
        _snapshot(
            zone="above",
            dma_distance=0.15,
            fgi_regime="neutral",
            fgi_slope=0.0,
        ),
    )
    assert intent.action == "hold"
    assert intent.reason not in (
        "above_dma_overextended_sell",
        "above_greed_fading_sell",
    )


# ── Params validation ────────────────────────────────────────────────


def test_params_reject_negative_overextension_threshold() -> None:
    """dma_overextension_threshold has ge=0.0 constraint."""
    with pytest.raises(ValidationError):
        DmaGatedFgiStrategy(
            total_capital=10_000.0,
            params={"dma_overextension_threshold": -0.1},
        )


def test_params_reject_positive_slope_threshold() -> None:
    """fgi_slope_reversal_threshold has le=0.0 constraint."""
    with pytest.raises(ValidationError):
        DmaGatedFgiStrategy(
            total_capital=10_000.0,
            params={"fgi_slope_reversal_threshold": 0.1},
        )
