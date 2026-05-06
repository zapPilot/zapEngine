"""Portfolio rule wrapper for DMA buy-side sideways confirmation."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.execution.pacing.base import compute_dma_buy_strength
from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    PortfolioSnapshot,
    current_fgi_regime_for_symbol,
    current_target,
    symbols_for_snapshot,
)
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.strategies.dma_buy_sideways_gate import (
    DmaBuyGateConfigMixin,
    DmaBuyGateSnapshot,
)

_EPSILON = 1e-9


@dataclass
class DmaBuyGateRule(DmaBuyGateConfigMixin):
    name: str = "dma_buy_gate"
    priority: int = 4
    rule_group: RuleGroup = "none"
    description: str = "Block stable-to-risk DCA buys until DMA sideways confirmation."

    def reset(self) -> None:
        self._gate.reset()

    def observe(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> None:
        del config
        if _has_dma_cross_event(snapshot):
            self._gate.reset()
        selected = _selected_state(snapshot)
        if selected is not None and selected.dma_distance is not None:
            self._gate.observe_dma_distance(selected.dma_distance)

    def record_intent(self, intent: AllocationIntent) -> None:
        if intent.action == "buy" and not intent.immediate:
            self._gate.record_buy_execution(1.0)

    def matches(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> bool:
        del config
        if not _has_stable_buy_supply(snapshot):
            return False
        if not _dca_buy_symbols(snapshot):
            return False
        gate_snapshot = self._gate.snapshot(buy_strength=_buy_strength(snapshot))
        return (
            not gate_snapshot.buy_sideways_confirmed
            or gate_snapshot.buy_episode_state == "consumed"
        )

    def build_intent(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent:
        del config
        gate_snapshot = self._blocking_snapshot(snapshot)
        return AllocationIntent(
            action="hold",
            target_allocation=current_target(snapshot),
            allocation_name=None,
            immediate=False,
            reason="dma_buy_gate_blocked",
            rule_group=self.rule_group,
            decision_score=0.0,
            diagnostics={
                "matched_rule_name": self.name,
                "buy_gate_block_reason": gate_snapshot.buy_gate_block_reason,
                "buy_sideways_confirmed": gate_snapshot.buy_sideways_confirmed,
                "buy_sideways_window_days": gate_snapshot.buy_sideways_window_days,
                "buy_sideways_range": gate_snapshot.buy_sideways_range,
                "buy_episode_state": gate_snapshot.buy_episode_state,
                "buy_strength": gate_snapshot.buy_strength,
            },
        )

    def _blocking_snapshot(self, snapshot: PortfolioSnapshot) -> DmaBuyGateSnapshot:
        buy_strength = _buy_strength(snapshot)
        current = self._gate.snapshot(buy_strength=buy_strength)
        if current.buy_episode_state == "consumed":
            return self._gate.snapshot(
                buy_strength=buy_strength,
                block_reason="breakout_not_seen",
            )
        return self._gate.snapshot(
            buy_strength=buy_strength,
            block_reason="sideways_not_confirmed",
        )


def _has_stable_buy_supply(snapshot: PortfolioSnapshot) -> bool:
    return float(current_target(snapshot).get("stable", 0.0)) > _EPSILON


def _dca_buy_symbols(snapshot: PortfolioSnapshot) -> list[str]:
    return [
        symbol
        for symbol in symbols_for_snapshot(snapshot)
        if current_fgi_regime_for_symbol(snapshot, symbol) == "extreme_fear"
        and snapshot.cycle_open_per_symbol.get(symbol, False)
    ]


def _selected_state(snapshot: PortfolioSnapshot) -> DmaMarketState | None:
    candidate_symbols = _dca_buy_symbols(snapshot)
    if not candidate_symbols:
        candidate_symbols = [
            symbol for symbol in ("BTC", "SPY", "ETH") if symbol in snapshot.assets
        ]
    if not candidate_symbols:
        return None
    return snapshot.assets[candidate_symbols[0]]


def _buy_strength(snapshot: PortfolioSnapshot) -> float:
    selected = _selected_state(snapshot)
    if selected is None:
        return 0.0
    return compute_dma_buy_strength(selected.dma_distance)


def _has_dma_cross_event(snapshot: PortfolioSnapshot) -> bool:
    if any(
        state.actionable_cross_event in {"cross_down", "cross_up"}
        for state in snapshot.assets.values()
    ):
        return True
    ratio_state = snapshot.eth_btc_ratio_state
    return ratio_state is not None and ratio_state.actionable_cross_event is not None


__all__ = ["DmaBuyGateRule"]
