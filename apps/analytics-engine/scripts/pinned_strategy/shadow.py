"""Instance-scoped EVM instrumentation of the unchanged Python production strategy."""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import asdict, dataclass
from unittest.mock import patch

from scripts.pinned_strategy.codec import (
    CROSS,
    EMPTY_STATES,
    KEYS,
    SYMBOLS,
    ZONE,
    epoch_day,
    mask,
    to_wad,
)
from scripts.pinned_strategy.evm import SliceEVM
from src.services.backtesting.portfolio_rules.base import PortfolioRuleConfig
from src.services.backtesting.portfolio_rules.cooldown_tracker import (
    RuleCooldownTracker,
)
from src.services.backtesting.portfolio_rules.cross_down_exit import CrossDownExitRule
from src.services.backtesting.portfolio_rules.decision_policy import (
    build_portfolio_snapshot,
)
from src.services.backtesting.signals.flat_minimum import (
    _ASSET_SPECS,
    _build_asset_dma_context,
    _forced_cross_events,
    _selected_dma_assets,
)
from src.services.backtesting.strategies.rule_based_portfolio import (
    RuleBasedPortfolioStrategy,
)


@dataclass
class Metrics:
    days: int = 0
    asset_observations: int = 0
    matched: int = 0
    executions: int = 0
    max_distance_absolute_error: float = 0.0
    max_distance_relative_error: float = 0.0
    max_target_error: float = 0.0
    distance_relative_threshold_failures: int = 0
    threshold_flips: int = 0

    def dict(self):
        return asdict(self)


class Shadow:
    def __init__(self, strategy, evm, metrics, strict_distance=False):
        self.strategy, self.evm, self.metrics = strategy, evm, metrics
        self.strict_distance = strict_distance
        self.states = EMPTY_STATES
        self.views = None
        self.last_execution = None
        self.tracker = RuleCooldownTracker()
        self.rule = CrossDownExitRule()
        self.config = PortfolioRuleConfig()
        self.install()

    def observations(self, context):
        values = []
        for spec in _ASSET_SPECS:
            asset = _build_asset_dma_context(context, spec)
            values.append(
                (0, 0)
                if asset is None
                else (to_wad(asset.price), to_wad(asset.extra_data["dma_200"]))
            )
        return values

    def check_states(self):
        component = self.strategy.signal_component
        for i, key in enumerate(("spy", "btc", "eth")):
            debug = component._signal_for(key)._runtime.debug_state()
            assert tuple(self.states[i]) == (
                ZONE[debug.last_observed_zone],
                ZONE[debug.last_actionable_zone],
                epoch_day(debug.cooldown_end_date),
                ZONE[debug.cooldown_blocked_zone],
            ), (SYMBOLS[i], self.states[i], debug)

    def install(self):
        component = self.strategy.signal_component
        policy = self.strategy.decision_policy
        warmup, observe, commit = (
            component.warmup,
            component.observe,
            component.apply_intent,
        )
        decide, record = policy.decide, policy.record_execution

        def wrapped_warmup(context):
            warmup(context)
            self.states = self.evm.call(
                "warmup", self.states, self.observations(context)
            )
            self.check_states()

        def wrapped_observe(context):
            snapshot = observe(context)
            self.views, self.states = self.evm.call(
                "observe",
                self.states,
                self.observations(context),
                epoch_day(context.date),
                component.config.cross_on_touch,
            )
            self.metrics.days += 1
            for i, key in enumerate(("spy", "btc", "eth")):
                state, view = snapshot.dma_state_for(key), self.views[i]
                if state is None:
                    assert view == (0, 0, 0, False, 0, 0, 0)
                    continue
                self.metrics.asset_observations += 1
                expected = (
                    ZONE[state.zone],
                    CROSS[state.cross_event],
                    CROSS[state.actionable_cross_event],
                    state.cooldown_state.active,
                    state.cooldown_state.remaining_days,
                    ZONE[state.cooldown_state.blocked_zone],
                )
                if view[:6] != expected:
                    self.metrics.threshold_flips += 1
                assert view[:6] == expected, (context.date, key, view, expected)
                error = abs(view[6] / 10**18 - state.dma_distance)
                relative = (
                    error / abs(state.dma_distance) if state.dma_distance else error
                )
                self.metrics.max_distance_absolute_error = max(
                    error, self.metrics.max_distance_absolute_error
                )
                self.metrics.max_distance_relative_error = max(
                    relative, self.metrics.max_distance_relative_error
                )
                if relative > 1e-15:
                    self.metrics.distance_relative_threshold_failures += 1
                if self.strict_distance:
                    # Relative 1e-15 alone is unachievable near DMA due to
                    # cancellation (see
                    # test_float_relative_distance_limit_is_explicit): WAD
                    # flooring leaves absolute error ~1e-16, which amplifies to
                    # large relative error when dma_distance is tiny. Accept
                    # absolute 1e-12 (same as target-allocation tolerance) as
                    # well as relative 1e-15.
                    assert relative <= 1e-15 or error <= 1e-12, (
                        context.date,
                        key,
                        relative,
                        error,
                    )
            self.check_states()
            return snapshot

        def wrapped_decide(snapshot):
            portfolio = build_portfolio_snapshot(snapshot, previous_fgi_regime={})
            result = self.evm.call(
                "cross_down_exit",
                self.views,
                [to_wad(portfolio.current_asset_allocation.get(k, 0.0)) for k in KEYS],
                epoch_day(self.last_execution),
                epoch_day(snapshot.current_date),
            )
            matched = self.rule.matches(portfolio, config=self.config)
            cooldown = self.tracker.is_cooled_off(
                self.rule, snapshot=portfolio, config=self.config
            )
            assert result[:3] == (
                matched,
                cooldown is not None,
                0 if cooldown is None else cooldown["remaining_days"],
            )
            if matched:
                self.metrics.matched += 1
                intent = self.rule.build_intent(portfolio, config=self.config)
                diag = intent.diagnostics
                assert result[3:6] == tuple(
                    mask(diag[k])
                    for k in (
                        "portfolio_rule_trigger_assets",
                        "portfolio_rule_exit_assets",
                        "portfolio_rule_assets",
                    )
                )
                assert sum(result[6]) == 10**18
                for i, key in enumerate(KEYS[:4]):
                    error = abs(result[6][i] / 10**18 - intent.target_allocation[key])
                    self.metrics.max_target_error = max(
                        error, self.metrics.max_target_error
                    )
                    assert error <= 1e-12, (snapshot.current_date, key, error)
                    if intent.target_allocation[key] == 0:
                        assert result[6][i] == 0, (key, "unexpected dust")
            return decide(snapshot)

        def wrapped_commit(*, current_date, snapshot, intent):
            updated = commit(
                current_date=current_date, snapshot=snapshot, intent=intent
            )
            forced = _forced_cross_events(intent)
            assert all(value == "cross_down" for value in forced.values()), forced
            self.states = self.evm.call(
                "commit",
                self.states,
                self.views,
                epoch_day(current_date),
                mask(_selected_dma_assets(intent)),
                intent.rule_group == "cross",
                mask(forced),
            )
            self.check_states()
            return updated

        def wrapped_record(*, context, intent, execution):
            record(context=context, intent=intent, execution=execution)
            if (intent.diagnostics or {}).get(
                "matched_rule_name"
            ) == "cross_down_exit" and execution.transfers:
                self.last_execution = context.date
                self.metrics.executions += 1
                self.tracker.record_execution(
                    self.rule, intent=intent, executed_at=context.date
                )
            assert (
                policy._ctx.cooldown_tracker.last_executed.get("cross_down_exit")
                == self.last_execution
            )

        component.warmup = wrapped_warmup
        component.observe = wrapped_observe
        component.apply_intent = wrapped_commit
        policy.decide = wrapped_decide
        policy.record_execution = wrapped_record


@contextmanager
def shadow_compare(evm=None, *, strict_distance=False):
    metrics = Metrics()
    evm = SliceEVM() if evm is None else evm
    original = RuleBasedPortfolioStrategy.initialize

    def initialize(strategy, *args, **kwargs):
        original(strategy, *args, **kwargs)
        Shadow(strategy, evm, metrics, strict_distance)

    with patch.object(RuleBasedPortfolioStrategy, "initialize", initialize):
        yield metrics
