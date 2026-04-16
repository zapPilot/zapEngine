"""DMA-gated FGI signal runtime facade."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.signals.contracts import SignalContext
from src.services.backtesting.signals.dma_gated_fgi.config import DmaGatedFgiConfig
from src.services.backtesting.signals.dma_gated_fgi.signal_engine import (
    DmaSignalEngine,
)
from src.services.backtesting.signals.dma_gated_fgi.types import (
    DmaMarketState,
    DmaRuntimeDebugState,
)
from src.services.backtesting.signals.runtime import SignalRuntime


@dataclass
class DmaGatedFgiSignalRuntime(SignalRuntime[DmaMarketState, DmaRuntimeDebugState]):
    """Runtime facade around the dedicated DMA market-state extractor."""

    config: DmaGatedFgiConfig = field(default_factory=DmaGatedFgiConfig)
    _signal_engine: DmaSignalEngine = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self._signal_engine = DmaSignalEngine(config=self.config)

    def reset(self) -> None:
        self._signal_engine.reset()

    def warmup(self, context: SignalContext) -> None:
        self._signal_engine.warmup(context)

    def observe(self, context: SignalContext) -> DmaMarketState:
        return self._signal_engine.build_market_state(context)

    def apply_intent(
        self,
        *,
        current_date: date,
        snapshot: DmaMarketState,
        intent: AllocationIntent,
    ) -> DmaMarketState:
        return self._signal_engine.apply_intent(
            current_date=current_date,
            market_state=snapshot,
            intent=intent,
        )

    def debug_state(self) -> DmaRuntimeDebugState:
        return self._signal_engine.debug_state()


__all__ = ["DmaGatedFgiSignalRuntime"]
