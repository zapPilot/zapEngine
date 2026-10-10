"""The checks a promotion runs itself on the evidence data.

A sweep and a holdout look arrive as files. These four are not files: they are
questions about the candidate that only the lab can answer by running it, so the
promotion asks them rather than taking anyone's word.
"""

from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path

from src.models.backtesting import BacktestCompareConfigV3, BacktestCompareRequestV3
from src.services.backtesting.constants import STRATEGY_DMA_FGI_PORTFOLIO_RULES
from src.services.backtesting.execution.compare import run_compare_v3_on_data
from src.services.backtesting.lab.bundle import Bundle
from src.services.backtesting.lab.envelope import Context
from src.services.backtesting.lab.evaluate import evaluate
from src.services.backtesting.lab.golden_commands import golden_differences
from src.services.backtesting.lab.liveness import DEAD, liveness
from src.services.backtesting.lab.promotion import OwnChecks
from src.services.backtesting.lab.runner import EvalConfig
from src.services.backtesting.spec import StrategySpec
from src.services.backtesting.strategy_registry import resolve_spec_strategy_config
from src.services.backtesting.validation.event_histories import (
    strategy_timeline,
    synthetic_event_history,
)
from src.services.backtesting.validation.event_runner import (
    evaluate_event,
    load_validation_events,
)

CANDIDATE_KEY = "candidate"
TOTAL_CAPITAL = 10_000.0


def validation_events(spec: StrategySpec, events_path: Path) -> tuple[int, list[str]]:
    """How many events apply to the rule strategy, and the ones ``spec`` fails.

    Each event is a short synthetic market shaped to produce one situation (a
    cross, a ratio move, a fear spike) with assertions about what the strategy
    must decide there. They are the behavioral contract the production reference
    keeps, so a candidate that breaks one is changing that contract, and the
    promotion that makes it the reference updates the fixture with it.
    """
    events = [
        event
        for event in load_validation_events(events_path)
        if event.applies_to(STRATEGY_DMA_FGI_PORTFOLIO_RULES)
    ]
    failures: list[str] = []
    for event in events:
        prices, sentiments, start, end = synthetic_event_history(event)
        response = run_compare_v3_on_data(
            prices=prices,
            sentiments=sentiments,
            request=BacktestCompareRequestV3(
                token_symbol="BTC",
                start_date=start,
                end_date=end,
                total_capital=TOTAL_CAPITAL,
                configs=[
                    BacktestCompareConfigV3(
                        config_id=CANDIDATE_KEY,
                        strategy_id=STRATEGY_DMA_FGI_PORTFOLIO_RULES,
                    )
                ],
            ),
            user_start_date=start,
            resolved_configs=[
                resolve_spec_strategy_config(spec, config_id=CANDIDATE_KEY)
            ],
        )
        timeline = strategy_timeline(response.model_dump(mode="json"), CANDIDATE_KEY)
        if not evaluate_event(event, timeline).passed:
            failures.append(event.id)
    return len(events), failures


def own_checks(
    spec: StrategySpec,
    bundle: Bundle,
    *,
    stress: Mapping[str, Bundle],
    events_path: Path,
    golden_path: Path,
    context: Context,
) -> OwnChecks:
    report = evaluate(
        spec, bundle, EvalConfig(leave_one_out=False, benchmarks=()), git=None
    )
    broken = [
        item["name"]
        for item in report.body["invariants"]
        if item["hard"] and item["count"] > 0
    ]
    primary = f"{bundle.manifest.name}:{bundle.manifest.bundle_id}"
    found = liveness(spec, {primary: bundle, **stress}, {primary}, EvalConfig())
    checked, failures = validation_events(spec, events_path)
    _, changed = golden_differences(golden_path, None, context)
    return OwnChecks(
        bundle_source=bundle.manifest.source,
        dead_parameters=[leaf.pointer for leaf in found.leaves if leaf.status == DEAD],
        broken_hard_invariants=broken,
        events_checked=checked,
        event_failures=failures,
        golden_differences=changed,
    )


__all__ = ["CANDIDATE_KEY", "own_checks", "validation_events"]
