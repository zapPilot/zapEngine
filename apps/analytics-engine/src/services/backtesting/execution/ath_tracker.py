# pyright: reportImplicitStringConcatenation=false
"""All-time-high tracking for DMA-first backtesting."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date
from typing import TYPE_CHECKING

from src.services.backtesting.constants import ATH_OVERRIDE_COOLDOWN_DAYS

if TYPE_CHECKING:
    from src.services.backtesting.strategies.base import StrategyContext

logger = logging.getLogger(__name__)


@dataclass
class ATHTracker:
    max_price_seen: float = 0.0
    max_portfolio_value_seen: float = 0.0
    last_override_date: date | None = None
    cooldown_days: int = ATH_OVERRIDE_COOLDOWN_DAYS
    _current_ath_event: str | None = field(default=None, init=False)

    def initialize(self, price: float, portfolio_value: float) -> None:
        self.max_price_seen = price
        self.max_portfolio_value_seen = portfolio_value
        self.last_override_date = None
        self._current_ath_event = None

    def initialize_from_context(self, context: StrategyContext) -> None:
        self.initialize(
            price=context.price,
            portfolio_value=context.portfolio.total_value(context.portfolio_price),
        )

    def check_token_ath(self, price: float) -> bool:
        is_ath = price > self.max_price_seen
        self.max_price_seen = max(self.max_price_seen, price)
        return is_ath

    def check_portfolio_ath(self, portfolio_value: float) -> bool:
        is_ath = portfolio_value > self.max_portfolio_value_seen
        self.max_portfolio_value_seen = max(
            self.max_portfolio_value_seen, portfolio_value
        )
        return is_ath

    def process_ath_event(self, context: StrategyContext) -> str | None:
        token_ath = self.check_token_ath(context.price)
        portfolio_ath = self.check_portfolio_ath(
            context.portfolio.total_value(context.portfolio_price)
        )

        ath_event: str | None = None
        if token_ath and portfolio_ath:
            ath_event = "both_ath"
        elif token_ath:
            ath_event = "token_ath"
        elif portfolio_ath:
            ath_event = "portfolio_ath"

        if (
            ath_event is not None
            and not self.is_override_allowed(context.date)
            and self.cooldown_days > 0
            and self.last_override_date is not None
        ):
            days_remaining = (
                self.cooldown_days - (context.date - self.last_override_date).days
            )
            logger.debug(
                "ATH detected (%s) but cooldown active (%s days remaining)",
                ath_event,
                days_remaining,
            )

        self._current_ath_event = ath_event
        return ath_event

    def is_override_allowed(self, current_date: date) -> bool:
        if self.last_override_date is None:
            return True
        return (current_date - self.last_override_date).days >= self.cooldown_days

    @property
    def current_ath_event(self) -> str | None:
        return self._current_ath_event
