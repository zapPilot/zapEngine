"""Tests for runtime-driven DMA signal output serialization."""

from __future__ import annotations

from datetime import date

import pytest

from src.services.backtesting.signals.contracts import SignalContext, SignalOutput
from src.services.backtesting.signals.dma_gated_fgi.config import DmaGatedFgiConfig
from src.services.backtesting.signals.dma_gated_fgi.constants import (
    BUY_TARGET,
    SELL_TARGET,
)
from src.services.backtesting.signals.dma_gated_fgi.metadata import build_signal_output
from src.services.backtesting.signals.dma_gated_fgi.runtime import (
    DmaGatedFgiSignalRuntime,
)
from src.services.backtesting.strategies.dma_gated_fgi import (
    _resolve_dma_allocation_intent,
)


def _context(
    *,
    price: float = 50_000.0,
    dma_200: float = 48_000.0,
    fgi: float | None = 30.0,
    label: str | None = None,
    ath_event: str | None = None,
    day: date = date(2025, 6, 1),
) -> SignalContext:
    sentiment: dict[str, object] | None = None
    if fgi is not None or label is not None:
        sentiment = {}
        if fgi is not None:
            sentiment["value"] = fgi
        if label is not None:
            sentiment["label"] = label
    return SignalContext(
        date=day,
        price=price,
        sentiment=sentiment,
        price_history=[price] * 10,
        portfolio_value=10_000.0,
        ath_event=ath_event,
        extra_data={"dma_200": dma_200},
    )


def _make_runtime(
    *,
    cross_cooldown_days: int = 30,
    cross_on_touch: bool = True,
) -> DmaGatedFgiSignalRuntime:
    return DmaGatedFgiSignalRuntime(
        config=DmaGatedFgiConfig(
            cross_cooldown_days=cross_cooldown_days,
            cross_on_touch=cross_on_touch,
        )
    )


def _emit_signal_output(
    runtime: DmaGatedFgiSignalRuntime,
    context: SignalContext,
) -> SignalOutput:
    snapshot = runtime.observe(context)
    intent = _resolve_dma_allocation_intent(snapshot)
    committed_snapshot = runtime.apply_intent(
        current_date=context.date,
        snapshot=snapshot,
        intent=intent,
    )
    return build_signal_output(
        market_state=committed_snapshot,
        intent=intent,
    )


def test_runtime_reset_clears_cooldown_and_zone_state() -> None:
    runtime = _make_runtime()
    _emit_signal_output(
        runtime,
        _context(price=55_000, dma_200=50_000, fgi=70, day=date(2025, 6, 1)),
    )
    _emit_signal_output(
        runtime,
        _context(price=50_000, dma_200=50_000, fgi=70, day=date(2025, 6, 2)),
    )

    runtime.reset()
    debug_state = runtime.debug_state()

    assert debug_state.last_observed_zone is None
    assert debug_state.last_actionable_zone is None
    assert debug_state.cooldown_end_date is None
    assert debug_state.cooldown_blocked_zone is None


def test_above_dma_extreme_greed_sells() -> None:
    signal = _emit_signal_output(
        _make_runtime(),
        _context(price=55_000, dma_200=50_000, fgi=90),
    )

    assert signal.metadata["reason"] == "above_extreme_greed_sell"
    assert signal.metadata["allocation_intent"]["target"] == SELL_TARGET
    assert signal.metadata["matched_rule_group"] == "dma_fgi"
    assert signal.score == pytest.approx(-1.0)
    assert signal.confidence == pytest.approx(1.0)


def test_above_dma_non_greed_holds() -> None:
    signal = _emit_signal_output(
        _make_runtime(),
        _context(price=55_000, dma_200=50_000, fgi=40),
    )

    assert signal.metadata["reason"] == "regime_no_signal"
    assert signal.metadata["allocation_intent"]["hold"] is True
    assert signal.score == pytest.approx(0.0)


def test_below_dma_extreme_fear_buys() -> None:
    signal = _emit_signal_output(
        _make_runtime(),
        _context(price=45_000, dma_200=50_000, fgi=10),
    )

    assert signal.metadata["reason"] == "below_extreme_fear_buy"
    assert signal.metadata["allocation_intent"]["target"] == BUY_TARGET
    assert signal.metadata["matched_rule_group"] == "dma_fgi"
    assert signal.score == pytest.approx(1.0)


def test_above_dma_ath_sell_is_fallback_when_dma_fgi_has_no_match() -> None:
    signal = _emit_signal_output(
        _make_runtime(),
        _context(
            price=55_000,
            dma_200=50_000,
            fgi=50,
            ath_event="token_ath",
        ),
    )

    assert signal.metadata["reason"] == "ath_sell"
    assert signal.metadata["allocation_intent"]["target"] == SELL_TARGET
    assert signal.metadata["matched_rule_group"] == "ath"


def test_runtime_emits_cooldown_signal_after_cross_commit() -> None:
    runtime = _make_runtime(cross_cooldown_days=30)
    runtime.warmup(
        _context(
            price=55_000,
            dma_200=50_000,
            fgi=70,
            label="greed",
            day=date(2025, 6, 1),
        )
    )

    cross_signal = _emit_signal_output(
        runtime,
        _context(
            price=45_000,
            dma_200=50_000,
            fgi=20,
            label="fear",
            day=date(2025, 6, 2),
        ),
    )
    blocked_signal = _emit_signal_output(
        runtime,
        _context(
            price=55_000,
            dma_200=50_000,
            fgi=80,
            label="greed",
            ath_event="token_ath",
            day=date(2025, 6, 3),
        ),
    )

    assert cross_signal.metadata["matched_rule_group"] == "cross"
    assert blocked_signal.metadata["reason"] == "above_side_cooldown_active"
    assert blocked_signal.metadata["matched_rule_group"] == "cooldown"


def test_above_dma_greed_sells_with_partial_score() -> None:
    signal = _emit_signal_output(
        _make_runtime(),
        _context(price=55_000, dma_200=50_000, fgi=70),
    )

    assert signal.metadata["reason"] == "above_greed_sell"
    assert signal.metadata["allocation_intent"]["target"] == SELL_TARGET
    assert signal.score == pytest.approx(-0.5)


def test_below_dma_non_extreme_fear_holds() -> None:
    signal = _emit_signal_output(
        _make_runtime(),
        _context(price=45_000, dma_200=50_000, fgi=30),
    )

    assert signal.metadata["reason"] == "regime_no_signal"
    assert signal.metadata["allocation_intent"]["hold"] is True
    assert signal.score == pytest.approx(0.0)


def test_below_dma_extreme_fear_beats_ath_fallback() -> None:
    signal = _emit_signal_output(
        _make_runtime(),
        _context(
            price=45_000,
            dma_200=50_000,
            fgi=10,
            ath_event="token_ath",
        ),
    )

    assert signal.metadata["reason"] == "below_extreme_fear_buy"
    assert signal.metadata["allocation_intent"]["target"] == BUY_TARGET
    assert signal.metadata["ath_event"] == "token_ath"
    assert signal.metadata["matched_rule_group"] == "dma_fgi"


def test_above_dma_greed_beats_ath_fallback() -> None:
    signal = _emit_signal_output(
        _make_runtime(),
        _context(
            price=55_000,
            dma_200=50_000,
            fgi=70,
            ath_event="both_ath",
        ),
    )

    assert signal.metadata["reason"] == "above_greed_sell"
    assert signal.metadata["ath_event"] == "both_ath"
    assert signal.metadata["matched_rule_group"] == "dma_fgi"


def test_above_dma_extreme_greed_beats_ath_fallback() -> None:
    signal = _emit_signal_output(
        _make_runtime(),
        _context(
            price=55_000,
            dma_200=50_000,
            fgi=90,
            ath_event="portfolio_ath",
        ),
    )

    assert signal.metadata["reason"] == "above_extreme_greed_sell"
    assert signal.metadata["ath_event"] == "portfolio_ath"
    assert signal.metadata["matched_rule_group"] == "dma_fgi"


def test_first_day_equal_dma_holds() -> None:
    signal = _emit_signal_output(
        _make_runtime(),
        _context(price=50_000, dma_200=50_000, fgi=65),
    )

    assert signal.metadata["reason"] == "price_equal_dma_hold"
    assert signal.metadata["allocation_intent"] == {
        "hold": True,
        "immediate": False,
        "target": None,
        "name": None,
    }
    assert signal.metadata["cross_event"] is None
    assert signal.metadata["matched_rule_group"] == "none"


def test_at_dma_with_ath_holds() -> None:
    signal = _emit_signal_output(
        _make_runtime(),
        _context(
            price=50_000,
            dma_200=50_000,
            fgi=65,
            ath_event="both_ath",
        ),
    )

    assert signal.metadata["reason"] == "price_equal_dma_hold"
    assert signal.metadata["allocation_intent"]["hold"] is True
    assert signal.metadata["ath_event"] == "both_ath"
    assert signal.metadata["matched_rule_group"] == "none"


def test_label_only_extreme_fear_buy_has_full_confidence() -> None:
    signal = _emit_signal_output(
        _make_runtime(),
        _context(
            price=45_000,
            dma_200=50_000,
            fgi=None,
            label="extreme_fear",
        ),
    )

    assert signal.metadata["fgi_regime"] == "extreme_fear"
    assert signal.metadata["reason"] == "below_extreme_fear_buy"
    assert signal.confidence == pytest.approx(1.0)


def test_missing_fgi_holds_with_zero_confidence() -> None:
    signal = _emit_signal_output(
        _make_runtime(),
        _context(price=45_000, dma_200=50_000, fgi=None),
    )

    assert signal.metadata["allocation_intent"]["hold"] is True
    assert signal.metadata["reason"] == "regime_no_signal"
    assert signal.raw_value is None
    assert signal.confidence == pytest.approx(0.0)


def test_missing_both_label_and_numeric_holds() -> None:
    signal = _emit_signal_output(
        _make_runtime(),
        _context(price=55_000, dma_200=50_000, fgi=None, label=None),
    )

    assert signal.metadata["fgi_regime"] == "neutral"
    assert signal.metadata["reason"] == "regime_no_signal"
    assert signal.metadata["allocation_intent"]["hold"] is True


def test_none_sentiment_above_dma_with_ath_sell_has_full_confidence() -> None:
    signal = _emit_signal_output(
        _make_runtime(),
        SignalContext(
            date=date(2025, 6, 1),
            price=55_000.0,
            sentiment=None,
            price_history=[55_000.0] * 10,
            portfolio_value=10_000.0,
            ath_event="portfolio_ath",
            extra_data={"dma_200": 50_000.0},
        ),
    )

    assert signal.metadata["reason"] == "ath_sell"
    assert signal.confidence == pytest.approx(1.0)
    assert signal.score == pytest.approx(-1.0)
    assert signal.metadata["matched_rule_group"] == "ath"


def test_none_sentiment_below_dma_with_ath_holds() -> None:
    signal = _emit_signal_output(
        _make_runtime(),
        SignalContext(
            date=date(2025, 6, 1),
            price=45_000.0,
            sentiment=None,
            price_history=[45_000.0] * 10,
            portfolio_value=10_000.0,
            ath_event="portfolio_ath",
            extra_data={"dma_200": 50_000.0},
        ),
    )

    assert signal.metadata["reason"] == "regime_no_signal"
    assert signal.metadata["allocation_intent"]["hold"] is True
    assert signal.confidence == pytest.approx(1.0)
    assert signal.metadata["matched_rule_group"] == "none"


def test_cross_on_touch_disabled_below_to_at_does_not_cross_up() -> None:
    runtime = _make_runtime(cross_on_touch=False)
    _emit_signal_output(
        runtime,
        _context(price=45_000, dma_200=50_000, fgi=30, day=date(2025, 6, 1)),
    )

    signal = _emit_signal_output(
        runtime,
        _context(price=50_000, dma_200=50_000, fgi=30, day=date(2025, 6, 2)),
    )

    assert signal.metadata["reason"] == "price_equal_dma_hold"
    assert signal.metadata["cross_event"] is None


def test_cross_on_touch_disabled_below_to_above_triggers_cross_up() -> None:
    runtime = _make_runtime(cross_on_touch=False)
    _emit_signal_output(
        runtime,
        _context(price=45_000, dma_200=50_000, fgi=30, day=date(2025, 6, 1)),
    )

    signal = _emit_signal_output(
        runtime,
        _context(price=55_000, dma_200=50_000, fgi=70, day=date(2025, 6, 2)),
    )

    assert signal.metadata["reason"] == "dma_cross_up"
    assert signal.metadata["cross_event"] == "cross_up"
    assert signal.immediate is True


def test_cross_on_touch_disabled_above_to_below_triggers_cross_down() -> None:
    runtime = _make_runtime(cross_on_touch=False)
    _emit_signal_output(
        runtime,
        _context(price=55_000, dma_200=50_000, fgi=70, day=date(2025, 6, 1)),
    )

    signal = _emit_signal_output(
        runtime,
        _context(price=45_000, dma_200=50_000, fgi=70, day=date(2025, 6, 2)),
    )

    assert signal.metadata["reason"] == "dma_cross_down"
    assert signal.metadata["cross_event"] == "cross_down"
    assert signal.metadata["allocation_intent"]["target"] == SELL_TARGET


def test_cross_up_beats_same_day_ath_sell() -> None:
    runtime = _make_runtime()
    _emit_signal_output(
        runtime,
        _context(price=45_000, dma_200=50_000, fgi=30, day=date(2025, 6, 1)),
    )

    signal = _emit_signal_output(
        runtime,
        _context(
            price=50_000,
            dma_200=50_000,
            fgi=None,
            label=None,
            ath_event="both_ath",
            day=date(2025, 6, 2),
        ),
    )

    assert signal.metadata["reason"] == "dma_cross_up"
    assert signal.metadata["ath_event"] == "both_ath"
    assert signal.metadata["matched_rule_group"] == "cross"
    assert signal.immediate is True


def test_cross_down_beats_same_day_ath_sell() -> None:
    runtime = _make_runtime()
    _emit_signal_output(
        runtime,
        _context(price=55_000, dma_200=50_000, fgi=70, day=date(2025, 6, 1)),
    )

    signal = _emit_signal_output(
        runtime,
        _context(
            price=50_000,
            dma_200=50_000,
            fgi=None,
            label=None,
            ath_event="portfolio_ath",
            day=date(2025, 6, 2),
        ),
    )

    assert signal.metadata["reason"] == "dma_cross_down"
    assert signal.metadata["ath_event"] == "portfolio_ath"
    assert signal.metadata["matched_rule_group"] == "cross"
    assert signal.immediate is True


def test_after_cross_down_below_side_extreme_fear_buy_allowed() -> None:
    runtime = _make_runtime()
    _emit_signal_output(
        runtime,
        _context(price=55_000, dma_200=50_000, fgi=70, day=date(2025, 6, 1)),
    )
    _emit_signal_output(
        runtime,
        _context(price=45_000, dma_200=50_000, fgi=30, day=date(2025, 6, 2)),
    )

    signal = _emit_signal_output(
        runtime,
        _context(price=44_000, dma_200=50_000, fgi=10, day=date(2025, 6, 3)),
    )

    assert signal.metadata["reason"] == "below_extreme_fear_buy"
    assert signal.metadata["cross_event"] is None
    assert signal.metadata["cooldown_active"] is True
    assert signal.metadata["cooldown_blocked_zone"] == "above"


def test_after_cross_up_below_side_is_blocked() -> None:
    runtime = _make_runtime()
    _emit_signal_output(
        runtime,
        _context(price=45_000, dma_200=50_000, fgi=30, day=date(2025, 6, 1)),
    )
    _emit_signal_output(
        runtime,
        _context(price=55_000, dma_200=50_000, fgi=70, day=date(2025, 6, 2)),
    )

    signal = _emit_signal_output(
        runtime,
        _context(
            price=45_000,
            dma_200=50_000,
            fgi=10,
            ath_event="token_ath",
            day=date(2025, 6, 3),
        ),
    )

    assert signal.metadata["reason"] == "below_side_cooldown_active"
    assert signal.metadata["allocation_intent"]["hold"] is True
    assert signal.metadata["matched_rule_group"] == "cooldown"
    assert signal.metadata["ath_event"] == "token_ath"


def test_cooldown_expiry_resumes_regime_gating() -> None:
    runtime = _make_runtime(cross_cooldown_days=2)
    _emit_signal_output(
        runtime,
        _context(price=55_000, dma_200=50_000, fgi=70, day=date(2025, 6, 1)),
    )
    _emit_signal_output(
        runtime,
        _context(price=45_000, dma_200=50_000, fgi=30, day=date(2025, 6, 2)),
    )
    _emit_signal_output(
        runtime,
        _context(price=55_000, dma_200=50_000, fgi=70, day=date(2025, 6, 3)),
    )
    _emit_signal_output(
        runtime,
        _context(price=55_000, dma_200=50_000, fgi=50, day=date(2025, 6, 4)),
    )

    signal = _emit_signal_output(
        runtime,
        _context(price=55_000, dma_200=50_000, fgi=70, day=date(2025, 6, 5)),
    )

    assert signal.metadata["reason"] == "above_greed_sell"
    assert signal.metadata["cross_event"] is None
    assert signal.metadata["cooldown_active"] is False
    assert signal.metadata["cooldown_blocked_zone"] is None
    assert signal.immediate is False


def test_no_retroactive_cross_after_cooldown_expiry() -> None:
    runtime = _make_runtime(cross_cooldown_days=2)
    _emit_signal_output(
        runtime,
        _context(price=55_000, dma_200=50_000, fgi=70, day=date(2025, 6, 1)),
    )
    _emit_signal_output(
        runtime,
        _context(price=45_000, dma_200=50_000, fgi=30, day=date(2025, 6, 2)),
    )
    _emit_signal_output(
        runtime,
        _context(price=55_000, dma_200=50_000, fgi=70, day=date(2025, 6, 3)),
    )
    _emit_signal_output(
        runtime,
        _context(price=55_000, dma_200=50_000, fgi=70, day=date(2025, 6, 4)),
    )

    signal = _emit_signal_output(
        runtime,
        _context(price=55_000, dma_200=50_000, fgi=70, day=date(2025, 6, 5)),
    )

    assert signal.metadata["reason"] != "dma_cross_up"
    assert signal.metadata["cooldown_active"] is False


def test_cooldown_remaining_days_countdown() -> None:
    runtime = _make_runtime(cross_cooldown_days=5)
    _emit_signal_output(
        runtime,
        _context(price=55_000, dma_200=50_000, fgi=70, day=date(2025, 6, 1)),
    )
    signal_cross = _emit_signal_output(
        runtime,
        _context(price=45_000, dma_200=50_000, fgi=30, day=date(2025, 6, 2)),
    )
    assert signal_cross.metadata["cooldown_remaining_days"] == 5

    for day_offset, expected_remaining in [(3, 4), (4, 3), (5, 2), (6, 1)]:
        signal = _emit_signal_output(
            runtime,
            _context(
                price=45_000,
                dma_200=50_000,
                fgi=30,
                day=date(2025, 6, day_offset),
            ),
        )
        assert signal.metadata["cooldown_remaining_days"] == expected_remaining
        assert signal.metadata["cooldown_active"] is True

    signal = _emit_signal_output(
        runtime,
        _context(price=45_000, dma_200=50_000, fgi=30, day=date(2025, 6, 7)),
    )
    assert signal.metadata["cooldown_remaining_days"] == 0
    assert signal.metadata["cooldown_active"] is True

    signal = _emit_signal_output(
        runtime,
        _context(price=45_000, dma_200=50_000, fgi=30, day=date(2025, 6, 8)),
    )
    assert signal.metadata["cooldown_active"] is False


def test_signal_metadata_contains_expected_dma_fields() -> None:
    signal = _emit_signal_output(
        _make_runtime(),
        _context(price=45_000, dma_200=50_000, fgi=30),
    )

    assert signal.metadata["price_above_dma"] is False
    assert signal.metadata["dma_distance"] == pytest.approx(-0.1)
    assert signal.metadata["fgi_value"] == 30
    assert signal.metadata["fgi_regime"] == "fear"
    assert signal.metadata["ath_event"] is None


def test_signal_source_and_regime_match_market_state() -> None:
    signal = _emit_signal_output(
        _make_runtime(),
        _context(price=55_000, dma_200=50_000, fgi=80),
    )

    assert signal.source == "dma_gated_fgi"
    assert signal.regime == "extreme_greed"
    assert signal.metadata["fgi_regime"] == "extreme_greed"


def test_signal_output_does_not_include_execution_fields() -> None:
    signal = _emit_signal_output(
        _make_runtime(),
        _context(price=45_000, dma_200=50_000, fgi=10),
    )

    assert "event" not in signal.metadata
    assert "action" not in signal.metadata
