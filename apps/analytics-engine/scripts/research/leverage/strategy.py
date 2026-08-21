"""Research-only leverage overlay for the canonical DMA/FGI strategy.

This model intentionally uses daily closes, fixed borrow APRs, and no live
execution path. It is not registered and does not alter API or allocation wire
contracts. The conservative liquidation threshold partially offsets the lack
of intraday wick data, but does not make the simulation liquidation-accurate.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field, replace
from datetime import date
from typing import Any

from scripts.research.leverage.config import LeverageConfig
from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.signals.flat_minimum import FlatMinimumState
from src.services.backtesting.strategies.base import (
    StrategyAction,
    StrategyContext,
    StrategyResult,
    TransferIntent,
)
from src.services.backtesting.strategies.rule_based_portfolio import (
    RuleBasedPortfolioStrategy,
)

_RISK_KEYS = ("btc", "eth", "spy")
_EPSILON = 1e-12


@dataclass
class LeveredRuleBasedPortfolioStrategy(RuleBasedPortfolioStrategy):
    leverage: LeverageConfig = field(default_factory=LeverageConfig)
    leverage_log: list[dict[str, Any]] = field(default_factory=list, init=False)
    _last_dip_borrow_date: date | None = field(default=None, init=False, repr=False)
    _fear_dip_debt_active: bool = field(default=False, init=False, repr=False)
    _pending_event: str | None = field(default=None, init=False, repr=False)
    _cumulative_interest: float = field(default=0.0, init=False, repr=False)
    _liquidation_count: int = field(default=0, init=False, repr=False)
    _max_observed_ltv: float = field(default=0.0, init=False, repr=False)
    _leverage_days: int = field(default=0, init=False, repr=False)

    def initialize(
        self,
        portfolio: Any,
        config: Any,
        context: StrategyContext,
    ) -> None:
        self.leverage_log = []
        self._last_dip_borrow_date = None
        self._fear_dip_debt_active = False
        self._pending_event = None
        self._cumulative_interest = 0.0
        self._liquidation_count = 0
        self._max_observed_ltv = 0.0
        self._leverage_days = 0
        super().initialize(portfolio, config, context)

    def on_day(self, context: StrategyContext) -> StrategyAction:
        base_action = super().on_day(context)
        state = self.signal_component.latest_state
        if state is None or self.leverage.mode == "off":
            self._pending_event = None
            return base_action
        return self.apply_leverage_overlay(
            context=context,
            base_action=base_action,
            state=state,
        )

    def apply_leverage_overlay(
        self,
        *,
        context: StrategyContext,
        base_action: StrategyAction,
        state: FlatMinimumState,
    ) -> StrategyAction:
        portfolio = context.portfolio
        price = context.portfolio_price
        self._pending_event = None
        ltv = portfolio.ltv(price)
        if ltv != float("inf"):
            self._max_observed_ltv = max(self._max_observed_ltv, ltv)

        if portfolio.debt_balance > _EPSILON and ltv >= self.leverage.liq_ltv:
            self._liquidation_count += 1
            self._fear_dip_debt_active = False
            return self._sell_and_repay(
                portfolio=portfolio,
                price=price,
                base_action=base_action,
                penalty=self.leverage.liquidation_penalty,
                event="liquidation",
            )

        if portfolio.debt_balance > _EPSILON and self._is_risk_reduction(base_action):
            self._pending_event = "base_repayment"
            return replace(base_action, debt_delta_usd=-portfolio.debt_balance)

        if (
            portfolio.debt_balance > _EPSILON
            and self._fear_dip_debt_active
            and self._fear_position_exited(state)
        ):
            self._fear_dip_debt_active = False
            return self._sell_and_repay(
                portfolio=portfolio,
                price=price,
                base_action=base_action,
                event="fear_exit",
            )

        if (
            portfolio.debt_balance > _EPSILON
            and ltv >= self.leverage.deleverage_trigger_ltv
        ):
            return self._deleverage_to_target(
                portfolio=portfolio,
                price=price,
                base_action=base_action,
                event="deleverage",
            )

        dip_asset = self._fear_dip_asset(state)
        if dip_asset is not None and self.leverage.mode in {"fear_dip", "both"}:
            borrow_amount = self._dip_borrow_amount(
                portfolio=portfolio,
                price=price,
            )
            if borrow_amount > _EPSILON:
                self._last_dip_borrow_date = context.date
                self._fear_dip_debt_active = True
                return self._borrow_and_buy(
                    base_action=base_action,
                    borrow_amount=borrow_amount,
                    weights={dip_asset: 1.0},
                    event="fear_dip_borrow",
                )

        if self.leverage.mode in {"risk_on", "both"} and self._btc_is_above(state):
            return self._apply_risk_on(
                portfolio=portfolio,
                price=price,
                base_action=base_action,
            )
        return base_action

    def _apply_risk_on(
        self,
        *,
        portfolio: Portfolio,
        price: float | dict[str, float],
        base_action: StrategyAction,
    ) -> StrategyAction:
        ltv = portfolio.ltv(price)
        if ltv == float("inf") or abs(ltv - self.leverage.target_ltv) <= (
            self.leverage.releverage_band
        ):
            return base_action
        if ltv > self.leverage.target_ltv:
            return self._deleverage_to_target(
                portfolio=portfolio,
                price=price,
                base_action=base_action,
                event="risk_on_rebalance",
            )

        borrow_amount = self._borrow_to_target(portfolio=portfolio, price=price)
        if borrow_amount <= _EPSILON:
            return base_action
        return self._borrow_and_buy(
            base_action=base_action,
            borrow_amount=borrow_amount,
            weights=self._risk_weights(portfolio, price),
            event="risk_on_borrow",
        )

    def _borrow_to_target(
        self,
        *,
        portfolio: Portfolio,
        price: float | dict[str, float],
    ) -> float:
        risk = portfolio.total_risk_value(price)
        debt = portfolio.debt_balance
        if risk <= _EPSILON:
            return 0.0
        target = self.leverage.target_ltv
        desired = max(0.0, (target * risk - debt) / (1.0 - target))
        return min(desired, self._max_borrow(portfolio=portfolio, price=price))

    def _dip_borrow_amount(
        self,
        *,
        portfolio: Portfolio,
        price: float | dict[str, float],
    ) -> float:
        desired = max(0.0, portfolio.equity(price)) * self.leverage.dip_borrow_fraction
        return min(desired, self._max_borrow(portfolio=portfolio, price=price))

    def _max_borrow(
        self,
        *,
        portfolio: Portfolio,
        price: float | dict[str, float],
    ) -> float:
        risk = portfolio.total_risk_value(price)
        debt = portfolio.debt_balance
        if risk <= _EPSILON:
            return 0.0
        cap = self.leverage.max_ltv
        return max(0.0, (cap * risk - debt) / (1.0 - cap))

    def _deleverage_to_target(
        self,
        *,
        portfolio: Portfolio,
        price: float | dict[str, float],
        base_action: StrategyAction,
        event: str,
    ) -> StrategyAction:
        risk = portfolio.total_risk_value(price)
        debt = portfolio.debt_balance
        target = self.leverage.target_ltv
        sale_amount = max(0.0, (debt - target * risk) / (1.0 - target))
        return self._sell_and_repay(
            portfolio=portfolio,
            price=price,
            base_action=base_action,
            repay_amount=min(debt, sale_amount),
            sale_amount=sale_amount,
            event=event,
        )

    def _sell_and_repay(
        self,
        *,
        portfolio: Portfolio,
        price: float | dict[str, float],
        base_action: StrategyAction,
        event: str,
        penalty: float = 0.0,
        repay_amount: float | None = None,
        sale_amount: float | None = None,
    ) -> StrategyAction:
        debt = portfolio.debt_balance
        repay = debt if repay_amount is None else min(debt, max(0.0, repay_amount))
        needed_sale = max(0.0, repay - portfolio.stable_balance)
        requested_sale = (
            needed_sale * (1.0 + penalty)
            if sale_amount is None
            else max(needed_sale, sale_amount)
        )
        transfers = self._proportional_sell_transfers(
            portfolio=portfolio,
            price=price,
            amount=requested_sale,
        )
        self._pending_event = event
        return replace(
            base_action,
            transfers=transfers or None,
            debt_delta_usd=-repay,
            stable_cost_usd=repay * penalty,
        )

    def _borrow_and_buy(
        self,
        *,
        base_action: StrategyAction,
        borrow_amount: float,
        weights: dict[str, float],
        event: str,
    ) -> StrategyAction:
        transfers = list(base_action.transfers or [])
        transfers.extend(
            TransferIntent("stable", asset, borrow_amount * weight)
            for asset, weight in weights.items()
            if weight > _EPSILON
        )
        self._pending_event = event
        return replace(
            base_action,
            transfers=transfers or None,
            debt_delta_usd=borrow_amount,
        )

    @staticmethod
    def _risk_weights(
        portfolio: Portfolio,
        price: float | dict[str, float],
    ) -> dict[str, float]:
        values = portfolio.asset_values(price)
        total = sum(values[key] for key in _RISK_KEYS)
        if total <= _EPSILON:
            return {"btc": 1.0}
        return {key: values[key] / total for key in _RISK_KEYS if values[key] > 0.0}

    @staticmethod
    def _proportional_sell_transfers(
        *,
        portfolio: Portfolio,
        price: float | dict[str, float],
        amount: float,
    ) -> list[TransferIntent]:
        values = portfolio.asset_values(price)
        total = sum(values[key] for key in _RISK_KEYS)
        sale = min(max(0.0, amount), total)
        if sale <= _EPSILON or total <= _EPSILON:
            return []
        return [
            TransferIntent(key, "stable", sale * values[key] / total)
            for key in _RISK_KEYS
            if values[key] > _EPSILON
        ]

    def _fear_dip_asset(self, state: FlatMinimumState) -> str | None:
        if not self._dip_cooldown_elapsed(state.current_date):
            return None
        for key in ("btc", "eth", "spy"):
            dma_state = state.dma_state_for(key)
            if (
                dma_state is not None
                and dma_state.zone == "below"
                and dma_state.fgi_regime == "extreme_fear"
            ):
                return key
        return None

    def _dip_cooldown_elapsed(self, current_date: date | None) -> bool:
        if current_date is None or self._last_dip_borrow_date is None:
            return True
        return (current_date - self._last_dip_borrow_date).days >= (
            self.leverage.dip_cooldown_days
        )

    @staticmethod
    def _btc_is_above(state: FlatMinimumState) -> bool:
        btc = state.dma_state_for("btc")
        return btc is not None and btc.zone == "above"

    @staticmethod
    def _fear_position_exited(state: FlatMinimumState) -> bool:
        return any(
            dma_state is not None
            and (dma_state.actionable_cross_event or dma_state.cross_event)
            == "cross_up"
            for dma_state in (
                state.dma_state_for("btc"),
                state.dma_state_for("eth"),
                state.dma_state_for("spy"),
            )
        )

    @staticmethod
    def _is_risk_reduction(action: StrategyAction) -> bool:
        return action.snapshot.decision.action == "sell"

    def record_day(
        self,
        context: StrategyContext,
        action: StrategyAction,
        yield_breakdown: dict[str, float],
        trade_executed: bool,
    ) -> None:
        super().record_day(context, action, yield_breakdown, trade_executed)
        portfolio = context.portfolio
        price = context.portfolio_price
        borrow_cost = float(yield_breakdown.get("borrow_cost", 0.0))
        self._cumulative_interest += borrow_cost
        ltv = portfolio.ltv(price)
        finite_ltv = 0.0 if ltv == float("inf") else ltv
        self._max_observed_ltv = max(self._max_observed_ltv, finite_ltv)
        if portfolio.debt_balance > _EPSILON:
            self._leverage_days += 1
        self.leverage_log.append(
            {
                "date": context.date.isoformat(),
                "debt": portfolio.debt_balance,
                "ltv": ltv,
                "health_factor": portfolio.health_factor(
                    price,
                    self.leverage.liq_ltv,
                ),
                "cum_interest": self._cumulative_interest,
                "event": self._pending_event,
            }
        )
        self._pending_event = None

    def parameters(self) -> dict[str, Any]:
        return {**super().parameters(), "leverage": asdict(self.leverage)}

    def finalize(self) -> StrategyResult:
        metrics = dict(super().finalize().metrics)
        metrics.update(
            {
                "liquidation_count": self._liquidation_count,
                "max_ltv": self._max_observed_ltv,
                "leverage_days": self._leverage_days,
                "cumulative_borrow_cost": self._cumulative_interest,
            }
        )
        return StrategyResult(metrics=metrics)


__all__ = ["LeveredRuleBasedPortfolioStrategy"]
