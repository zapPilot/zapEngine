"""Run the reference strategy under either DMA touch semantics.

The pinned contract takes ``cross_on_touch`` as an argument, so the shadow
checks must exercise both values. The public strategy params do not expose
it (no history it was ever tried on made it change a decision), so the spike
selects it here instead of through saved-config params.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import replace
from unittest.mock import patch

from src.services.backtesting.portfolio_rules.components import SignalSettings
from src.services.backtesting.signals.flat_minimum import FlatMinimumSignalComponent
from src.services.backtesting.strategies import rule_based_portfolio


@contextmanager
def cross_on_touch_mode(touch: bool) -> Iterator[None]:
    """Build every rule-based strategy in this block with ``cross_on_touch=touch``."""
    build = rule_based_portfolio.build_signal_component

    def with_touch(
        settings: SignalSettings, *, signal_id: str
    ) -> FlatMinimumSignalComponent:
        return build(replace(settings, cross_on_touch=touch), signal_id=signal_id)

    with patch.object(rule_based_portfolio, "build_signal_component", with_touch):
        yield
