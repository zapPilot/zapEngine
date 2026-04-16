"""Tests for shared signal protocols."""

from datetime import date

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.signals.contracts import (
    SignalContext,
    SignalOutput,
)
from src.services.backtesting.signals.runtime import SignalRuntime


def test_signal_context_creation():
    """Test creating SignalContext."""
    ctx = SignalContext(
        date=date(2024, 1, 1),
        price=100.0,
        sentiment={"value": 50},
        price_history=[90.0, 100.0],
        portfolio_value=1000.0,
    )
    assert ctx.date == date(2024, 1, 1)
    assert ctx.price == 100.0
    assert ctx.extra_data == {}


class MockStrategyContext:
    def __init__(self):
        self.date = date(2024, 1, 1)
        self.price = 100.0
        self.sentiment = {"value": 50}
        self.price_history = [90.0, 100.0]
        self.extra_data = {}
        self.portfolio = self

    def total_value(self, price):
        return 1000.0


class MockATHTracker:
    def __init__(self):
        self.current_ath_event = "token_ath"


def test_signal_context_from_strategy():
    """Test factory method from_strategy_context."""
    strat_ctx = MockStrategyContext()
    ath_tracker = MockATHTracker()

    ctx = SignalContext.from_strategy_context(
        strat_ctx,
        ath_tracker=ath_tracker,
        regime_history=["neutral"],
    )

    assert ctx.date == strat_ctx.date
    assert ctx.portfolio_value == 1000.0
    assert ctx.ath_event == "token_ath"
    assert ctx.regime_history == ["neutral"]


def test_signal_context_from_strategy_extra_data_defensive_copy():
    """Test extra_data is copied and not aliased from caller."""
    strat_ctx = MockStrategyContext()
    extra_data = {"vix": 22.5, "mvrv": 1.9}

    ctx = SignalContext.from_strategy_context(
        strat_ctx,
        extra_data=extra_data,
    )

    assert ctx.extra_data == {"vix": 22.5, "mvrv": 1.9}

    extra_data["vix"] = 30.0
    assert ctx.extra_data["vix"] == 22.5


def test_signal_context_from_strategy_uses_context_extra_data():
    """Test extra_data defaults to context.extra_data when not explicitly passed."""
    strat_ctx = MockStrategyContext()
    strat_ctx.extra_data = {"dma_200": 42000.0}

    ctx = SignalContext.from_strategy_context(strat_ctx)

    assert ctx.extra_data == {"dma_200": 42000.0}
    strat_ctx.extra_data["dma_200"] = 1.0
    assert ctx.extra_data["dma_200"] == 42000.0


def test_signal_output_creation():
    """Test creating SignalOutput with defaults."""
    signal = SignalOutput(score=0.5, confidence=1.0, regime="greed")
    assert signal.score == 0.5
    assert signal.confidence == 1.0
    assert signal.regime == "greed"
    assert signal.raw_value is None
    assert signal.source == ""
    assert signal.metadata == {}


def test_signal_output_full():
    """Test creating SignalOutput with all fields."""
    signal = SignalOutput(
        score=-0.8,
        confidence=1.0,
        regime="extreme_fear",
        raw_value=10.0,
        source="dma_gated_fgi",
        metadata={"fgi_value": 10.0},
    )
    assert signal.score == -0.8
    assert signal.raw_value == 10.0
    assert signal.source == "dma_gated_fgi"
    assert signal.metadata["fgi_value"] == 10.0


def test_signal_output_is_frozen():
    """Test that SignalOutput is immutable."""
    import pytest

    signal = SignalOutput(score=0.0, confidence=1.0, regime="neutral")
    with pytest.raises(AttributeError):
        signal.score = 0.5  # type: ignore[misc]


def test_signal_runtime_protocol() -> None:
    """Test that the DMA signal runtime implements the runtime protocol."""
    from src.services.backtesting.signals.dma_gated_fgi.runtime import (
        DmaGatedFgiSignalRuntime,
    )

    assert isinstance(DmaGatedFgiSignalRuntime(), SignalRuntime)


def test_signal_runtime_observe_returns_dma_market_state() -> None:
    from src.services.backtesting.signals.dma_gated_fgi.runtime import (
        DmaGatedFgiSignalRuntime,
    )

    runtime = DmaGatedFgiSignalRuntime()
    snapshot = runtime.observe(
        SignalContext(
            date=date(2024, 1, 1),
            price=100.0,
            sentiment={"label": "neutral", "value": 50},
            price_history=[],
            portfolio_value=1000.0,
            extra_data={"dma_200": 100.0},
        )
    )

    assert snapshot.signal_id == "dma_gated_fgi"
    assert snapshot.dma_200 == 100.0


def test_allocation_intent_serializes_legacy_signal_payload() -> None:
    intent = AllocationIntent(
        action="buy",
        target_allocation={"spot": 1.0, "stable": 0.0},
        allocation_name="dma_below_extreme_fear_buy",
        immediate=False,
        reason="below_extreme_fear_buy",
        rule_group="dma_fgi",
        decision_score=1.0,
    )

    assert intent.to_signal_payload() == {
        "target": {"spot": 1.0, "stable": 0.0},
        "name": "dma_below_extreme_fear_buy",
        "hold": False,
        "immediate": False,
    }
