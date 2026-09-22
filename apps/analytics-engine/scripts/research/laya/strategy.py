"""Research-only strategy wrapper for Laya direct-allocation backtests."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from pydantic import JsonValue

from scripts.research.laya.client import LayaDecisionClient
from scripts.research.laya.decoder import ScoreDecoding
from scripts.research.laya.policy import LayaDecisionPolicy
from scripts.research.laya.questions import ENCODING_VERSION, EncodingId
from src.services.backtesting.composition import ResolvedSavedStrategyConfig
from src.services.backtesting.execution.rule_based.allocation_executor import (
    RuleBasedAllocationExecutor,
)
from src.services.backtesting.signals.dma_gated_fgi.config import DmaGatedFgiConfig
from src.services.backtesting.signals.flat_minimum import (
    FlatMinimumSignalComponent,
    build_initial_flat_minimum_asset_allocation,
)
from src.services.backtesting.strategies.base import (
    StrategyAction,
    StrategyContext,
    StrategyResult,
)
from src.services.backtesting.strategies.composed import ComposedSignalStrategy
from src.services.backtesting.strategy_registry import (
    StrategyBuildRequest,
    get_strategy_recipe,
)

LAYA_WARMUP_LOOKBACK_DAYS = 100
BASELINE_STRATEGY_ID = "dma_fgi_portfolio_rules"


@dataclass(frozen=True)
class LayaExperimentSpec:
    encoding: EncodingId
    decision_cadence_days: int = 1
    score_decoding: ScoreDecoding = "expected"
    drift_rebalance_threshold: float | None = None

    @property
    def config_id(self) -> str:
        return f"laya_{self.encoding}_c{max(1, int(self.decision_cadence_days))}"


@dataclass(kw_only=True)
class LayaDirectAllocationStrategy(ComposedSignalStrategy):
    total_capital: float
    encoding: EncodingId
    client: LayaDecisionClient = field(repr=False)
    decision_cadence_days: int = 1
    score_decoding: ScoreDecoding = "expected"
    drift_rebalance_threshold: float | None = None
    signal_component: FlatMinimumSignalComponent = field(init=False, repr=False)
    decision_policy: LayaDecisionPolicy = field(init=False, repr=False)
    execution_engine: RuleBasedAllocationExecutor = field(init=False, repr=False)
    public_params: dict[str, Any] = field(default_factory=dict)
    signal_id: str = "laya_flat_minimum_signal"
    summary_signal_id: str | None = "laya_flat_minimum_signal"
    strategy_id: str = "laya_direct_allocation"
    display_name: str = "Laya Direct Allocation (Research)"
    canonical_strategy_id: str = BASELINE_STRATEGY_ID
    initial_spot_asset: str = "BTC"
    initial_asset_allocation: dict[str, float] | None = None

    def __post_init__(self) -> None:
        self.execution_engine = RuleBasedAllocationExecutor()
        self.signal_component = FlatMinimumSignalComponent(
            config=DmaGatedFgiConfig(),
            signal_id=self.signal_id,
            warmup_lookback_days=LAYA_WARMUP_LOOKBACK_DAYS,
        )
        self.decision_policy = LayaDecisionPolicy(
            encoding=self.encoding,
            client=self.client,
            decision_cadence_days=max(1, int(self.decision_cadence_days)),
            score_decoding=self.score_decoding,
            drift_rebalance_threshold=self.drift_rebalance_threshold,
        )
        self.public_params = self.parameters()

    def initialize(
        self,
        portfolio: Any,
        config: Any,
        context: StrategyContext,
    ) -> None:
        self.decision_policy.reset()
        super().initialize(portfolio, config, context)

    def on_day(self, context: StrategyContext) -> StrategyAction:
        self.decision_policy.bind_market_context(context)
        return super().on_day(context)

    def finalize(self) -> StrategyResult:
        return StrategyResult(
            metrics={"laya_metrics": self.decision_policy.summary_metrics()}
        )

    def parameters(self) -> dict[str, Any]:
        return {
            "encoding": self.encoding,
            "encoding_version": ENCODING_VERSION[self.encoding],
            "decision_cadence_days": max(1, int(self.decision_cadence_days)),
            "score_decoding": self.score_decoding,
            "model_id": self.client.model_id,
            "device": self.client.device_tag,
            "drift_rebalance_threshold": self.drift_rebalance_threshold,
            "research_only": True,
        }


def _initial_asset_allocation(request: StrategyBuildRequest) -> dict[str, float]:
    if request.initial_allocation is None:
        raise ValueError("Laya compare requires an initial allocation")
    first = request.user_prices[0] if request.user_prices else {}
    return build_initial_flat_minimum_asset_allocation(
        aggregate_allocation=request.initial_allocation,
        extra_data=first.get("extra_data") if first else None,
        price_map=first.get("prices") if first else None,
        primary_price=(
            float(first["price"])
            if isinstance(first.get("price"), int | float)
            else None
        ),
    )


def resolved_laya_config(
    spec: LayaExperimentSpec,
    client: LayaDecisionClient,
) -> ResolvedSavedStrategyConfig:
    recipe = get_strategy_recipe(BASELINE_STRATEGY_ID)
    config_id = spec.config_id

    def build_strategy(request: StrategyBuildRequest) -> LayaDirectAllocationStrategy:
        return LayaDirectAllocationStrategy(
            total_capital=request.total_capital,
            encoding=spec.encoding,
            client=client,
            decision_cadence_days=spec.decision_cadence_days,
            score_decoding=spec.score_decoding,
            drift_rebalance_threshold=spec.drift_rebalance_threshold,
            strategy_id=request.resolved_config_id,
            display_name=request.resolved_config_id,
            canonical_strategy_id=BASELINE_STRATEGY_ID,
            initial_asset_allocation=_initial_asset_allocation(request),
        )

    public_params: dict[str, JsonValue] = {}
    return ResolvedSavedStrategyConfig(
        saved_config_id=config_id,
        request_config_id=config_id,
        strategy_id=BASELINE_STRATEGY_ID,
        display_name=config_id,
        description="Research-only offline Laya allocation overlay; not API-registered.",
        primary_asset=recipe.primary_asset,
        summary_signal_id="laya_flat_minimum_signal",
        warmup_lookback_days=max(
            recipe.warmup_lookback_days,
            LAYA_WARMUP_LOOKBACK_DAYS,
        ),
        market_data_requirements=recipe.market_data_requirements,
        portfolio_bucket_mapper=recipe.portfolio_bucket_mapper,
        runtime_portfolio_mode=recipe.runtime_portfolio_mode,
        supports_daily_suggestion=False,
        public_params=public_params,
        build_strategy=build_strategy,
    )


__all__ = [
    "BASELINE_STRATEGY_ID",
    "LAYA_WARMUP_LOOKBACK_DAYS",
    "LayaDirectAllocationStrategy",
    "LayaExperimentSpec",
    "resolved_laya_config",
]
