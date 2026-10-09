"""Pinned behavior of a strategy spec on deterministic synthetic markets.

The snapshot gate (``sweep_production_window.py --check``) needs production data
and a read-only DSN, so a change meant to be behavior-neutral cannot be proven
neutral without them. A golden is the DSN-free equivalent: the per-day decisions,
targets, transfers and equity of a spec on six synthetic histories are hashed, so
any drift in a rule, a cooldown or the executor changes a digest. Only values the
engine computes with plain float arithmetic enter the hash; numpy-derived metrics
(Sharpe and friends) can differ in the last bit between platforms and stay out.

A golden belongs to a *behavior*, so the file records each spec's behavior hash:
a spec that changed fails the check before any digest is compared, and the way
out is a version bump and a deliberate regeneration, never an edited digest.
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any

from src.models.backtesting import BacktestResponse
from src.services.backtesting.lab.bundle import synthetic_bundle
from src.services.backtesting.lab.runner import EvalConfig, prepare, run_specs
from src.services.backtesting.lab.synthetic import Scenario
from src.services.backtesting.spec import StrategySpec, behavior_hash

GOLDEN_FORMAT = "golden-traces/1"
APP_ROOT = Path(__file__).resolve().parents[4]
GOLDEN_PATH = APP_ROOT / "tests/fixtures/strategy_specs/golden_traces.json"
DAYS = 400
SCENARIOS: tuple[tuple[Scenario, int], ...] = (
    ("regimes", 1),
    ("regimes", 2),
    ("regimes", 3),
    ("stress", 1),
    ("stress", 2),
    ("stress", 3),
)
STRATEGY = "strategy"
# What a golden pins by default: the production reference, and one spec that
# uses every research kind, the SPY latch overlay and the trade quota guard.
DEFAULT_SPECS = (
    "reference/dma_fgi",
    "tests/fixtures/strategy_specs/all_research_rules.json",
)


class GoldenError(ValueError):
    """The golden file is missing or is not one."""


def scenario_key(scenario: str, seed: int) -> str:
    return f"{scenario}?seed={seed}"


def matched_rule_name(details: Mapping[str, Any]) -> str | None:
    name = details.get("matched_rule_name")
    return name if isinstance(name, str) else None


def decision_trace(response: BacktestResponse, key: str) -> list[list[Any]]:
    """Per-day decision, target, transfers and equity, rounded for stability.

    Only values the engine computes with plain float arithmetic are included;
    numpy-derived metrics (Sharpe and friends) can differ in the last bit
    between platforms and are deliberately left out.
    """
    trace: list[list[Any]] = []
    for point in response.timeline:
        state = point.strategies[key]
        target = state.decision.target_allocation.model_dump()
        trace.append(
            [
                point.market.date.isoformat(),
                state.decision.action,
                state.decision.reason,
                matched_rule_name(state.decision.details),
                [round(target[name], 6) for name in sorted(target)],
                [
                    [t.from_bucket, t.to_bucket, round(t.amount_usd, 4)]
                    for t in state.execution.transfers
                ],
                round(state.portfolio.total_value, 4),
            ]
        )
    return trace


def trace_summary(response: BacktestResponse, key: str) -> dict[str, Any]:
    trace = decision_trace(response, key)
    encoded = json.dumps(trace, sort_keys=True, separators=(",", ":"))
    summary = response.strategies[key]
    return {
        "trade_count": summary.trade_count,
        "final_value": round(summary.final_value, 4),
        "rule_counts": dict(sorted(Counter(str(row[3]) for row in trace).items())),
        "digest": hashlib.sha256(encoded.encode()).hexdigest(),
    }


def run_scenario(
    spec: StrategySpec,
    scenario: Scenario,
    seed: int,
    *,
    days: int = DAYS,
) -> dict[str, Any]:
    """The summary of ``spec`` run over one synthetic history."""
    bundle = synthetic_bundle(f"synthetic:{scenario}?seed={seed}&days={days}")
    config = EvalConfig(leave_one_out=False, benchmarks=())
    response = run_specs({STRATEGY: spec}, prepare(bundle, config), config)
    return trace_summary(response, STRATEGY)


def entry_for(spec: StrategySpec) -> dict[str, Any]:
    """What a golden file holds for one spec."""
    return {
        "behavior_hash": behavior_hash(spec),
        "scenarios": {
            scenario_key(scenario, seed): run_scenario(spec, scenario, seed)
            for scenario, seed in SCENARIOS
        },
    }


def render(entries: Mapping[str, Mapping[str, Any]]) -> str:
    document = {"format": GOLDEN_FORMAT, "days": DAYS, "specs": entries}
    return json.dumps(document, indent=2, sort_keys=True) + "\n"


def read(path: Path) -> dict[str, dict[str, Any]]:
    """The per-spec entries of a golden file."""
    try:
        document = json.loads(path.read_text())
    except FileNotFoundError as error:
        raise GoldenError(f"No golden file at {path}") from error
    except json.JSONDecodeError as error:
        raise GoldenError(f"{path.name} is not JSON: {error}") from error
    if (
        not isinstance(document, dict)
        or document.get("format") != GOLDEN_FORMAT
        or document.get("days") != DAYS
        or not isinstance(document.get("specs"), dict)
    ):
        raise GoldenError(
            f"{path.name} is not a {GOLDEN_FORMAT} file of {DAYS}-day histories"
        )
    return dict(document["specs"])


def differences(
    expected: Mapping[str, Any],
    actual: Mapping[str, Any],
) -> list[str]:
    """What changed between a recorded entry and the one a spec gives now."""
    if expected.get("behavior_hash") != actual["behavior_hash"]:
        return [
            f"the spec's behavior changed ({expected.get('behavior_hash')} -> "
            f"{actual['behavior_hash']}); bump its version, then regenerate"
        ]
    problems: list[str] = []
    recorded = expected.get("scenarios", {})
    for key, summary in actual["scenarios"].items():
        if key not in recorded:
            problems.append(f"{key}: not recorded")
            continue
        problems.extend(_field_differences(key, recorded[key], summary))
    problems.extend(
        f"{key}: recorded but not run"
        for key in recorded
        if key not in actual["scenarios"]
    )
    return problems


def _field_differences(
    key: str,
    expected: Mapping[str, Any],
    actual: Mapping[str, Any],
) -> Iterable[str]:
    for field in ("digest", "trade_count", "final_value", "rule_counts"):
        if expected.get(field) != actual[field]:
            yield f"{key}: {field} was {expected.get(field)!r}, is {actual[field]!r}"


__all__ = [
    "APP_ROOT",
    "DAYS",
    "DEFAULT_SPECS",
    "GOLDEN_FORMAT",
    "GOLDEN_PATH",
    "GoldenError",
    "SCENARIOS",
    "STRATEGY",
    "decision_trace",
    "differences",
    "entry_for",
    "matched_rule_name",
    "read",
    "render",
    "run_scenario",
    "scenario_key",
    "trace_summary",
]
