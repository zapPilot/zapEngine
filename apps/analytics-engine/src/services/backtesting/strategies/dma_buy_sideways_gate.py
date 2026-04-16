"""Buy-side sideways confirmation gate for the dedicated DMA runtime."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from typing import Literal

EpisodeState = Literal["idle", "armed", "consumed"]

_DEFAULT_LEG_CAP_PCTS: tuple[float, ...] = (0.05, 0.10, 0.20)


@dataclass(frozen=True)
class DmaBuyGateSnapshot:
    """Observable state for DMA buy gating and ladder caps."""

    buy_strength: float
    buy_sideways_confirmed: bool
    buy_sideways_window_days: int
    buy_sideways_range: float | None
    buy_leg_index: int | None
    buy_leg_cap_pct: float | None
    buy_leg_cap_usd: float | None
    buy_leg_spent_usd: float
    buy_episode_state: EpisodeState
    buy_gate_block_reason: str | None = None


@dataclass(frozen=True)
class DmaBuyGateDecision:
    """Resolved buy gating decision for the current day."""

    allowed: bool
    snapshot: DmaBuyGateSnapshot


@dataclass
class DmaBuySidewaysGate:
    """Stateful sideways confirmation gate for DMA buy execution.

    A confirmed sideways episode unlocks exactly one buy execution. After a buy
    is executed, the gate remains consumed until the rolling DMA-deviation range
    breaks out above the sideways threshold and later re-confirms.
    """

    window_days: int = 5
    sideways_range_threshold: float = 0.04
    leg_cap_pcts: tuple[float, ...] = _DEFAULT_LEG_CAP_PCTS
    _recent_distances: deque[float] = field(init=False, repr=False)
    _episode_state: EpisodeState = field(default="idle", init=False)
    _completed_legs: int = field(default=0, init=False)
    _active_leg_index: int | None = field(default=None, init=False)
    _active_leg_cap_pct: float | None = field(default=None, init=False)
    _active_leg_cap_usd: float | None = field(default=None, init=False)
    _active_leg_spent_usd: float = field(default=0.0, init=False)

    def __post_init__(self) -> None:
        self.window_days = max(1, int(self.window_days))
        self.sideways_range_threshold = max(0.0, float(self.sideways_range_threshold))
        self._recent_distances = deque(maxlen=self.window_days)

    def reset(self) -> None:
        self._recent_distances.clear()
        self._episode_state = "idle"
        self._completed_legs = 0
        self._clear_active_episode()

    def observe_dma_distance(self, dma_distance: float) -> None:
        self._recent_distances.append(float(dma_distance))
        sideways_range = self.current_sideways_range
        if sideways_range is None:
            return

        if (
            self._episode_state == "armed"
            and sideways_range > self.sideways_range_threshold
        ):
            self._clear_active_episode()
            return

        if (
            self._episode_state == "consumed"
            and sideways_range > self.sideways_range_threshold
        ):
            self._clear_active_episode()

    @property
    def current_sideways_range(self) -> float | None:
        if len(self._recent_distances) < self.window_days:
            return None
        return max(self._recent_distances) - min(self._recent_distances)

    @property
    def sideways_confirmed(self) -> bool:
        sideways_range = self.current_sideways_range
        return sideways_range is not None and sideways_range <= (
            self.sideways_range_threshold + 1e-12
        )

    def snapshot(
        self,
        *,
        buy_strength: float,
        block_reason: str | None = None,
    ) -> DmaBuyGateSnapshot:
        return DmaBuyGateSnapshot(
            buy_strength=float(buy_strength),
            buy_sideways_confirmed=self.sideways_confirmed,
            buy_sideways_window_days=self.window_days,
            buy_sideways_range=self.current_sideways_range,
            buy_leg_index=self._active_leg_index,
            buy_leg_cap_pct=self._active_leg_cap_pct,
            buy_leg_cap_usd=self._active_leg_cap_usd,
            buy_leg_spent_usd=self._active_leg_spent_usd,
            buy_episode_state=self._episode_state,
            buy_gate_block_reason=block_reason,
        )

    def prepare_buy_execution(
        self,
        *,
        nav_usd: float,
        buy_strength: float,
    ) -> DmaBuyGateDecision:
        if self._episode_state == "consumed":
            return DmaBuyGateDecision(
                allowed=False,
                snapshot=self.snapshot(
                    buy_strength=buy_strength,
                    block_reason="breakout_not_seen",
                ),
            )

        if not self.sideways_confirmed:
            return DmaBuyGateDecision(
                allowed=False,
                snapshot=self.snapshot(
                    buy_strength=buy_strength,
                    block_reason="sideways_not_confirmed",
                ),
            )

        if self._episode_state == "idle":
            self._arm_new_episode(nav_usd)

        return DmaBuyGateDecision(
            allowed=True,
            snapshot=self.snapshot(buy_strength=buy_strength),
        )

    def cap_buy_amount(self, planned_buy_usd: float) -> float:
        if planned_buy_usd <= 0.0:
            return 0.0
        if self._active_leg_cap_usd is None:
            return float(planned_buy_usd)
        remaining = max(0.0, self._active_leg_cap_usd - self._active_leg_spent_usd)
        return min(float(planned_buy_usd), remaining)

    def record_buy_execution(self, amount_usd: float) -> None:
        executed = max(0.0, float(amount_usd))
        if executed <= 0.0:
            return
        self._active_leg_spent_usd += executed
        if self._active_leg_index is not None:
            self._completed_legs = max(self._completed_legs, self._active_leg_index)
        self._episode_state = "consumed"

    def _arm_new_episode(self, nav_usd: float) -> None:
        leg_index = self._completed_legs + 1
        cap_pct = (
            self.leg_cap_pcts[leg_index - 1]
            if leg_index <= len(self.leg_cap_pcts)
            else None
        )
        self._active_leg_index = leg_index
        self._active_leg_cap_pct = cap_pct
        self._active_leg_cap_usd = (
            None if cap_pct is None else max(0.0, float(nav_usd)) * float(cap_pct)
        )
        self._active_leg_spent_usd = 0.0
        self._episode_state = "armed"

    def _clear_active_episode(self) -> None:
        self._episode_state = "idle"
        self._active_leg_index = None
        self._active_leg_cap_pct = None
        self._active_leg_cap_usd = None
        self._active_leg_spent_usd = 0.0


__all__ = [
    "DmaBuyGateDecision",
    "DmaBuyGateSnapshot",
    "DmaBuySidewaysGate",
]
