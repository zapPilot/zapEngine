"""Builders for daily-suggestion tests: replays, a stub replayer, user portfolios."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, date, datetime
from types import SimpleNamespace
from typing import Any
from uuid import UUID

from src.models.backtesting import (
    Allocation,
    AssetAllocation,
    BacktestPeriodInfo,
    BacktestWindowInfo,
    DecisionState,
    ExecutionState,
    MarketSnapshot,
    PortfolioState,
    SignalState,
    StrategyState,
    TargetAllocation,
    TransferRecord,
)
from src.models.market_data_freshness import MarketDataFreshness
from src.services.strategy.backtesting_protocol import ModelReplay
from src.services.strategy.strategy_daily_suggestion_service import (
    StrategyDailySuggestionService,
)
from tests.services.backtesting.support import mock_portfolio

USER_ID = UUID("00000000-0000-0000-0000-000000000001")
OTHER_USER_ID = UUID("00000000-0000-0000-0000-000000000002")
DEFAULT_CONFIG_ID = "dma_fgi_portfolio_rules_default"
MODEL_DAY = date(2026, 5, 15)
# 03:00 UTC on the day after MODEL_DAY: the model's end is then UTC yesterday.
NOW = datetime(2026, 5, 16, 3, 0, tzinfo=UTC)
PRICE_MAP = {"btc": 100_000.0, "eth": 3_000.0, "spy": 500.0}
ALL_STABLE = {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}


def build_signal() -> SignalState:
    return SignalState(
        id="dma_fgi_portfolio_rules_signal",
        regime="greed",
        raw_value=72.0,
        confidence=1.0,
        details={"dma": {"dma_200": 95_000.0, "zone": "above"}},
    )


def build_replay(
    *,
    target: dict[str, float] | None = None,
    model_allocation: dict[str, float] | None = None,
    traded: bool = True,
    action: str = "sell",
    reason: str = "portfolio_cross_down_exit",
    rule_group: str = "cross",
    details: dict[str, Any] | None = None,
    blocked_reason: str | None = None,
    signal: SignalState | None = None,
    freshness: MarketDataFreshness | None = None,
) -> ModelReplay:
    """A model replay whose last bar traded (or not) toward ``target``."""
    resolved_target = target or ALL_STABLE
    resolved_allocation = model_allocation or resolved_target
    transfers = (
        [TransferRecord(from_bucket="btc", to_bucket="stable", amount_usd=100.0)]
        if traded
        else []
    )
    window = BacktestPeriodInfo(
        start_date=date(2025, 1, 1),
        end_date=MODEL_DAY,
        days=499,
    )
    state = StrategyState(
        portfolio=PortfolioState(
            spot_usd=0.0,
            stable_usd=10_000.0,
            total_value=10_000.0,
            allocation=Allocation(spot=0.0, stable=1.0),
            asset_allocation=AssetAllocation(**resolved_allocation),
        ),
        signal=signal or build_signal(),
        decision=DecisionState(
            action=action,  # type: ignore[arg-type]
            reason=reason,
            rule_group=rule_group,  # type: ignore[arg-type]
            target_allocation=TargetAllocation(**resolved_target),
            details=details or {"matched_rule_name": "cross_down_exit"},
        ),
        execution=ExecutionState(
            event="rebalance" if traded else None,
            transfers=transfers,
            blocked_reason=blocked_reason,
            status="action_required" if traded else "no_action",
            action_required=traded,
        ),
    )
    return ModelReplay(
        config_id=DEFAULT_CONFIG_ID,
        window=BacktestWindowInfo(requested=window, effective=window),
        data_freshness=freshness,
        market=MarketSnapshot(
            date=MODEL_DAY,
            token_price=dict(PRICE_MAP),
            sentiment=72,
            sentiment_label="greed",
        ),
        state=state,
    )


class StubReplayer:
    """Stands in for BacktestingService: serves one replay, records each call."""

    def __init__(self, replay: ModelReplay | Exception) -> None:
        self.replay = replay
        self.calls: list[tuple[str, date]] = []

    def replay_model(self, saved_config_id: str, requested_end: date) -> ModelReplay:
        self.calls.append((saved_config_id, requested_end))
        if isinstance(self.replay, Exception):
            raise self.replay
        return self.replay


class UserPortfolios:
    """Landing-page fake serving per-user holdings and counting each lookup."""

    def __init__(self, **default_holdings: float) -> None:
        self.default_holdings = default_holdings
        self.holdings_by_user: dict[UUID, dict[str, float]] = {}
        self.calls: list[UUID] = []

    def get_landing_page_data(self, user_id: UUID) -> object:
        self.calls.append(user_id)
        return mock_portfolio(
            **self.holdings_by_user.get(user_id, self.default_holdings)
        )


class Clock:
    def __init__(self, now: datetime = NOW) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now


def build_service(
    replay: ModelReplay | Exception,
    *,
    holdings: dict[str, float] | None = None,
    clock: Callable[[], datetime] | None = None,
    canonical_snapshot_service: object | None = None,
    strategy_config_store: object | None = None,
) -> tuple[StrategyDailySuggestionService, StubReplayer, UserPortfolios]:
    replayer = StubReplayer(replay)
    portfolios = UserPortfolios(**(holdings or {"btc": 5_000.0, "stable": 5_000.0}))
    service = StrategyDailySuggestionService(
        landing_page_service=portfolios,  # type: ignore[arg-type]
        backtesting_service=replayer,  # type: ignore[arg-type]
        canonical_snapshot_service=canonical_snapshot_service,  # type: ignore[arg-type]
        strategy_config_store=strategy_config_store,  # type: ignore[arg-type]
        clock=clock or Clock(),
    )
    return service, replayer, portfolios


def anchor_service(dates: list[date]) -> SimpleNamespace:
    """Canonical-snapshot fake whose anchor date is the next value in ``dates``."""
    queue = list(dates)
    return SimpleNamespace(
        get_snapshot_date=lambda _user_id: queue.pop(0) if len(queue) > 1 else queue[0]
    )
