"""Runtime contracts for stateful backtesting signal extraction."""

from __future__ import annotations

from datetime import date
from typing import Protocol, TypeVar, runtime_checkable

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.signals.contracts import SignalContext

SignalSnapshotT = TypeVar("SignalSnapshotT")
SignalDebugStateT = TypeVar("SignalDebugStateT", covariant=True)


@runtime_checkable
class SignalRuntime(Protocol[SignalSnapshotT, SignalDebugStateT]):
    """Protocol for stateful signal runtimes used by strategies.

    A runtime extracts signal-specific market state from a generic
    :class:`SignalContext`. Some runtimes also need to commit intent-dependent
    state transitions after the strategy has decided what to do.
    """

    def reset(self) -> None:
        """Clear all runtime state for a fresh simulation."""
        ...

    def warmup(self, context: SignalContext) -> None:
        """Prime runtime state without emitting a snapshot."""
        ...

    def observe(self, context: SignalContext) -> SignalSnapshotT:
        """Build the current signal snapshot from market context."""
        ...

    def apply_intent(
        self,
        *,
        current_date: date,
        snapshot: SignalSnapshotT,
        intent: AllocationIntent,
    ) -> SignalSnapshotT:
        """Commit any intent-dependent state changes and return the snapshot."""
        ...

    def debug_state(self) -> SignalDebugStateT:
        """Expose a single explicit testing/debug snapshot."""
        ...
