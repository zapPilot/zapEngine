"""Parameter sweeps that do not fool themselves.

Trying many parameter sets and keeping the best is how a strategy comes to look
better than it is. A sweep here is built to say how much to believe it:

- only the development window is used; the last days are left for a holdout;
- every trial is one continuous, causal run over the development window, and the
  walk-forward folds are slices of it (a trial never sees a test block before
  it is traded);
- inside each fold the best trial is chosen on the training slice alone and then
  judged on the next block against the reference (nested selection), so the
  fold results are out-of-sample by construction;
- the answer is the share of folds won, a block-bootstrap interval of the
  out-of-sample edge, whether the best trial sits on a plateau or a spike, and
  the deflated Sharpe ratio, which charges the best trial for how many
  candidates the ledger says have been tried.

Fewer than ``MIN_FOLDS`` folds is ``insufficient_evidence``, never a result.
"""

from __future__ import annotations

import itertools
import json
import random
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from statistics import fmean
from typing import Any, TypeGuard

from src.models.backtesting import BacktestAssumptions, BacktestResponse
from src.services.backtesting.lab import pointers
from src.services.backtesting.lab.bundle import Bundle
from src.services.backtesting.lab.coverage import (
    CompleteWindow,
    coverage_of,
    recommend_split,
)
from src.services.backtesting.lab.evaluate import SYNTHETIC_WARNING
from src.services.backtesting.lab.folds import MIN_FOLDS, Fold, folds_for
from src.services.backtesting.lab.ledger import Ledger
from src.services.backtesting.lab.liveness import tunable_leaves
from src.services.backtesting.lab.report import hash_of, normalize
from src.services.backtesting.lab.runner import EvalConfig, prepare, run_specs
from src.services.backtesting.lab.stats import (
    DAYS_PER_YEAR,
    EquityCurve,
    block_bootstrap,
    compounded,
    daily_sharpe,
    deflated_sharpe,
    max_drawdown_percent,
    plateau_retention,
    sharpe,
)
from src.services.backtesting.spec import (
    StrategySpec,
    behavior_hash,
    parse_spec,
    spec_ref,
)
from src.services.backtesting.spec.validation import SpecError

MAX_TRIALS = 200
METHODS = ("grid", "random", "halton")
_HALTON_PRIMES = (2, 3, 5, 7, 11, 13, 17, 19, 23, 29)
_DECIMALS = 6
BASE = "base"
# The spec the folds are judged against, when it is not the one being searched.
REFERENCE = "reference"
TOP_TRIALS = 5
OK = "ok"
INSUFFICIENT = "insufficient_evidence"


class SpaceError(ValueError):
    """The search space is malformed or does not fit the spec."""


@dataclass(frozen=True)
class Parameter:
    """One dimension: a spec leaf and the values to try there."""

    pointer: str
    values: tuple[Any, ...] = ()
    low: float | None = None
    high: float | None = None
    steps: int | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "pointer": self.pointer,
            "values": list(self.values),
            "min": self.low,
            "max": self.high,
            "steps": self.steps,
        }


@dataclass(frozen=True)
class SearchSpace:
    parameters: tuple[Parameter, ...]
    method: str = "grid"
    trials: int = 50
    seed: int = 1

    def as_dict(self) -> dict[str, Any]:
        return {
            "parameters": [item.as_dict() for item in self.parameters],
            "method": self.method,
            "trials": self.trials,
            "seed": self.seed,
        }


_PARAMETER_KEYS = {"pointer", "values", "min", "max", "steps"}
_SAMPLING_KEYS = {"method", "trials", "seed"}


def load_space(path: Path) -> SearchSpace:
    try:
        raw = json.loads(path.read_text())
    except FileNotFoundError as error:
        raise SpaceError(f"No search space at {path}") from error
    except json.JSONDecodeError as error:
        raise SpaceError(f"{path.name} is not JSON: {error}") from error
    return parse_space(raw)


def parse_space(raw: Any) -> SearchSpace:
    if not isinstance(raw, Mapping) or set(raw) - {"parameters", "sampling"}:
        raise SpaceError("A search space has 'parameters' and optionally 'sampling'")
    entries = raw.get("parameters")
    if not isinstance(entries, list) or not entries:
        raise SpaceError("'parameters' must be a non-empty list")
    parameters = tuple(_parameter(entry) for entry in entries)
    if len({item.pointer for item in parameters}) != len(parameters):
        raise SpaceError("A pointer appears twice in 'parameters'")
    sampling = raw.get("sampling", {})
    if not isinstance(sampling, Mapping) or set(sampling) - _SAMPLING_KEYS:
        raise SpaceError(f"'sampling' takes only {sorted(_SAMPLING_KEYS)}")
    method = sampling.get("method", "grid")
    trials = sampling.get("trials", 50)
    seed = sampling.get("seed", 1)
    if method not in METHODS:
        raise SpaceError(f"sampling.method must be one of {', '.join(METHODS)}")
    if not _is_int(trials) or not 1 <= trials <= MAX_TRIALS:
        raise SpaceError(f"sampling.trials must be an integer from 1 to {MAX_TRIALS}")
    if not _is_int(seed):
        raise SpaceError("sampling.seed must be an integer")
    if method == "halton" and len(parameters) > len(_HALTON_PRIMES):
        raise SpaceError(
            f"halton sampling handles at most {len(_HALTON_PRIMES)} parameters"
        )
    return SearchSpace(parameters, method, trials, seed)


def _parameter(entry: Any) -> Parameter:
    if not isinstance(entry, Mapping) or set(entry) - _PARAMETER_KEYS:
        raise SpaceError(f"A parameter takes only {sorted(_PARAMETER_KEYS)}")
    pointer = entry.get("pointer")
    if not isinstance(pointer, str):
        raise SpaceError("Every parameter needs a 'pointer'")
    values = entry.get("values")
    low, high, steps = entry.get("min"), entry.get("max"), entry.get("steps")
    if values is not None:
        if low is not None or high is not None or steps is not None:
            raise SpaceError(f"{pointer}: use 'values' or 'min' and 'max', not both")
        if not isinstance(values, list) or not values:
            raise SpaceError(f"{pointer}: 'values' must be a non-empty list")
        return Parameter(pointer, values=tuple(values))
    if not _is_number(low) or not _is_number(high) or low >= high:
        raise SpaceError(f"{pointer}: give 'values', or 'min' below 'max'")
    if steps is not None and (not _is_int(steps) or steps < 2):
        raise SpaceError(f"{pointer}: 'steps' must be an integer of at least 2")
    return Parameter(pointer, low=float(low), high=float(high), steps=steps)


def check_space(space: SearchSpace, spec: StrategySpec) -> None:
    """Every pointer must be a tunable leaf of the spec, and every value its type."""
    leaves = {leaf.pointer: leaf for leaf in tunable_leaves(spec)}
    for parameter in space.parameters:
        leaf = leaves.get(parameter.pointer)
        if leaf is None:
            raise SpaceError(
                f"{parameter.pointer} is not a tunable leaf of the spec; the "
                f"tunable pointers are: {', '.join(sorted(leaves))}"
            )
        if isinstance(leaf.value, bool):
            if parameter.low is not None or any(
                not isinstance(item, bool) for item in parameter.values
            ):
                raise SpaceError(
                    f"{parameter.pointer} is a flag: give true/false values"
                )
        elif any(not _is_number(item) for item in parameter.values):
            raise SpaceError(f"{parameter.pointer} is a number: give numeric values")
        if (
            space.method == "grid"
            and parameter.values == ()
            and parameter.steps is None
        ):
            raise SpaceError(f"{parameter.pointer}: a grid needs 'values' or 'steps'")


def sample(space: SearchSpace, spec: StrategySpec) -> list[dict[str, Any]]:
    """The assignments to try, as ``{pointer: value}``, without repeats."""
    kinds = {
        leaf.pointer: isinstance(leaf.value, int) and not isinstance(leaf.value, bool)
        for leaf in tunable_leaves(spec)
    }
    if space.method == "grid":
        axes = [_axis(item, kinds[item.pointer]) for item in space.parameters]
        size = 1
        for axis in axes:
            size *= len(axis)
        if size > MAX_TRIALS:
            raise SpaceError(
                f"The grid has {size} points; the limit is {MAX_TRIALS}. Use "
                "random or halton sampling, or fewer values."
            )
        draws = [list(point) for point in itertools.product(*axes)]
    elif space.method == "random":
        rng = random.Random(space.seed)
        draws = [
            [
                _draw(item, rng.random(), kinds[item.pointer], rng)
                for item in space.parameters
            ]
            for _ in range(space.trials)
        ]
    else:
        draws = [
            [
                _draw(
                    item,
                    _radical_inverse(index, _HALTON_PRIMES[dimension]),
                    kinds[item.pointer],
                )
                for dimension, item in enumerate(space.parameters)
            ]
            for index in range(1, space.trials + 1)
        ]
    seen: set[tuple[Any, ...]] = set()
    assignments: list[dict[str, Any]] = []
    for draw in draws:
        key = tuple(draw)
        if key not in seen:
            seen.add(key)
            assignments.append(
                {
                    item.pointer: value
                    for item, value in zip(space.parameters, draw, strict=True)
                }
            )
    return assignments


def _axis(parameter: Parameter, integer: bool) -> list[Any]:
    if parameter.values:
        return list(dict.fromkeys(parameter.values))
    assert parameter.low is not None and parameter.high is not None and parameter.steps
    span = parameter.high - parameter.low
    points = [
        parameter.low + span * index / (parameter.steps - 1)
        for index in range(parameter.steps)
    ]
    return list(dict.fromkeys(_shape(point, integer) for point in points))


def _draw(
    parameter: Parameter,
    unit: float,
    integer: bool,
    rng: random.Random | None = None,
) -> Any:
    """One value for ``parameter`` from ``unit`` in ``[0, 1)``."""
    if parameter.values:
        return parameter.values[
            min(int(unit * len(parameter.values)), len(parameter.values) - 1)
        ]
    assert parameter.low is not None and parameter.high is not None
    return _shape(parameter.low + unit * (parameter.high - parameter.low), integer)


def _shape(value: float, integer: bool) -> Any:
    return int(round(value)) if integer else round(value, _DECIMALS)


def _radical_inverse(index: int, base: int) -> float:
    """The van der Corput value of ``index``: evenly spread points in ``[0, 1)``."""
    result, fraction = 0.0, 1.0 / base
    while index > 0:
        result += (index % base) * fraction
        index //= base
        fraction /= base
    return result


def _is_int(value: Any) -> TypeGuard[int]:
    return isinstance(value, int) and not isinstance(value, bool)


def _is_number(value: Any) -> TypeGuard[int | float]:
    return isinstance(value, int | float) and not isinstance(value, bool)


@dataclass(frozen=True)
class SweepConfig:
    assumptions: BacktestAssumptions = BacktestAssumptions()
    total_capital: float = 10_000.0
    bootstrap_block: int = 10
    bootstrap_resamples: int = 2000
    neighbors: int = 5


def apply(raw: Mapping[str, Any], assignment: Mapping[str, Any]) -> StrategySpec:
    """The spec with every assignment applied; ``SpecError`` if it is not valid."""
    changed: Any = dict(raw)
    for pointer, value in assignment.items():
        changed = pointers.set_at(changed, pointer, value)
    return parse_spec(changed)


def sweep(
    spec: StrategySpec,
    bundle: Bundle,
    space: SearchSpace,
    config: SweepConfig | None = None,
    *,
    ledger: Ledger | None = None,
    reference: StrategySpec | None = None,
) -> dict[str, Any]:
    """Search ``space`` around ``spec`` and judge the result against ``reference``.

    Without a ``reference`` the folds are judged against ``spec`` itself, which
    answers whether tuning helped. With one (the production reference, say) they
    answer whether the best of the search beats it out of sample.
    """
    config = config or SweepConfig()
    check_space(space, spec)
    baseline = spec if reference is None else reference
    same_as_base = behavior_hash(baseline) == behavior_hash(spec)
    eval_config = EvalConfig(
        assumptions=config.assumptions, total_capital=config.total_capital
    )
    identity = {
        "spec": {"ref": spec_ref(spec), "behavior_hash": behavior_hash(spec)},
        "reference": {
            "ref": spec_ref(baseline),
            "behavior_hash": behavior_hash(baseline),
        },
        "bundle": {
            "ref": f"{bundle.manifest.name}:{bundle.manifest.bundle_id}",
            "content_sha256": bundle.manifest.content_sha256,
            "source": bundle.manifest.source,
        },
        "eval_config_hash": hash_of(normalize(eval_config.as_dict())),
        "space_hash": hash_of(normalize(space.as_dict())),
    }
    sweep_id = hash_of(identity).split(":")[1][:16]
    window = _development_window(bundle)
    recommendation = recommend_split(window)
    development = recommendation.development
    folds = folds_for(*development) if development else []
    if len(folds) < MIN_FOLDS:
        return _insufficient(sweep_id, identity, recommendation.as_dict(), folds)

    # Three folds need 540 development days, and a window that long has always
    # had a holdout carved out of it, so a sweep that runs always has one.
    holdout = recommendation.holdout
    assert development is not None and holdout is not None
    dev_start, dev_end = development
    assignments, specs, invalid = _trial_specs(spec, space)
    if not specs:
        raise SpaceError("No assignment in the search space makes a valid spec")
    run_config = EvalConfig(
        assumptions=config.assumptions,
        total_capital=config.total_capital,
        start=dev_start,
        end=dev_end,
    )
    judged_against = BASE if same_as_base else REFERENCE
    response = run_specs(
        {
            BASE: spec,
            **{f"t{index}": trial for index, trial in enumerate(specs)},
            **({} if same_as_base else {REFERENCE: baseline}),
        },
        prepare(bundle, run_config),
        run_config,
    )
    curves = {
        key: _curve(response, key)
        for key in [BASE, judged_against, *(f"t{i}" for i in range(len(specs)))]
    }
    full = {key: curve.returns(dev_start, dev_end) for key, curve in curves.items()}
    rf = config.assumptions.stable_apr
    scores = [sharpe(full[f"t{index}"], rf) for index in range(len(specs))]
    if ledger is not None:
        _record(ledger, sweep_id, identity, spec, specs, assignments, scores)
        trials = ledger.distinct_candidates()
    else:
        trials = len(specs)

    fold_rows, diffs = _walk_forward(curves, assignments, folds, rf, judged_against)
    best = max(range(len(specs)), key=lambda index: (scores[index], -index))
    best_returns = full[f"t{best}"]
    per_day = [
        daily_sharpe(full[f"t{index}"], rf / DAYS_PER_YEAR)
        for index in range(len(specs))
    ]
    bootstrap = block_bootstrap(
        diffs,
        block=config.bootstrap_block,
        resamples=config.bootstrap_resamples,
        seed=space.seed,
    )
    wins = sum(1 for row in fold_rows if row["oos"]["win"])
    ranked = sorted(range(len(specs)), key=lambda index: (-scores[index], index))
    body = {
        "status": OK,
        "sweep_id": sweep_id,
        "fingerprint": identity,
        "window": {
            "development": _span(development),
            "holdout": _span(holdout),
            "folds": len(folds),
        },
        "folds": fold_rows,
        "aggregate": {
            "fold_win_rate": wins / len(fold_rows),
            "mean_oos_edge_pp": fmean(row["oos"]["edge_pp"] for row in fold_rows),
            "distinct_selected": len({row["selected"]["trial"] for row in fold_rows}),
            "oos_edge_annualized_pp": bootstrap.scaled(DAYS_PER_YEAR * 100.0).as_dict(),
        },
        "trials": {
            "valid": len(specs),
            "invalid": invalid,
            "top": [
                {
                    "trial": index,
                    "params": assignments[index],
                    "sharpe": scores[index],
                    "roi_percent": compounded(full[f"t{index}"]) * 100.0,
                }
                for index in ranked[:TOP_TRIALS]
            ],
        },
        "best": {
            "trial": best,
            "params": assignments[best],
            "sharpe": scores[best],
            "roi_percent": compounded(best_returns) * 100.0,
        },
        "reference": {
            "sharpe": sharpe(full[judged_against], rf),
            "roi_percent": compounded(full[judged_against]) * 100.0,
        },
        "plateau": {
            "neighbors": config.neighbors,
            "retention": plateau_retention(
                _normalized_points(space, assignments),
                scores,
                best,
                neighbors=config.neighbors,
            ),
        },
        "deflated_sharpe": {
            "value": deflated_sharpe(
                best_returns,
                risk_free_daily=rf / DAYS_PER_YEAR,
                trial_sharpes=per_day,
                trials=trials,
            ),
            "trials": trials,
        },
        "warnings": _warnings(bundle),
    }
    return dict(normalize(body))


def _development_window(bundle: Bundle) -> CompleteWindow | None:
    complete = coverage_of(bundle.prices, bundle.sentiments).complete_window
    if complete is None:
        return None
    start = max(bundle.manifest.start, complete.start)
    if start > complete.end:
        return None
    return CompleteWindow(start, complete.end, complete.rows)


def _insufficient(
    sweep_id: str,
    identity: Mapping[str, Any],
    recommendation: Mapping[str, Any],
    folds: Sequence[Fold],
) -> dict[str, Any]:
    reasons = [
        str(recommendation["reason"]),
        f"{len(folds)} walk-forward folds fit; at least {MIN_FOLDS} are needed for a "
        "sweep to say anything. Synthetic data does not substitute for evidence.",
    ]
    return dict(
        normalize(
            {
                "status": INSUFFICIENT,
                "sweep_id": sweep_id,
                "fingerprint": identity,
                "reasons": reasons,
                "recommendation": recommendation,
            }
        )
    )


def _trial_specs(
    spec: StrategySpec,
    space: SearchSpace,
) -> tuple[list[dict[str, Any]], list[StrategySpec], list[dict[str, Any]]]:
    raw = spec.model_dump(mode="json")
    assignments: list[dict[str, Any]] = []
    specs: list[StrategySpec] = []
    invalid: list[dict[str, Any]] = []
    for assignment in sample(space, spec):
        try:
            candidate = apply(raw, assignment)
        except SpecError as error:
            invalid.append({"params": assignment, "reason": str(error)})
            continue
        assignments.append(assignment)
        specs.append(candidate)
    return assignments, specs, invalid


def _curve(response: BacktestResponse, key: str) -> EquityCurve:
    return EquityCurve(
        dates=[point.market.date for point in response.timeline],
        values=[
            point.strategies[key].portfolio.total_value for point in response.timeline
        ],
    )


def _walk_forward(
    curves: Mapping[str, EquityCurve],
    assignments: Sequence[Mapping[str, Any]],
    folds: Sequence[Fold],
    risk_free_apr: float,
    baseline: str,
) -> tuple[list[dict[str, Any]], list[float]]:
    rows: list[dict[str, Any]] = []
    diffs: list[float] = []
    for fold in folds:
        train = [
            sharpe(curves[f"t{index}"].returns(*fold.train), risk_free_apr)
            for index in range(len(assignments))
        ]
        chosen = max(range(len(assignments)), key=lambda index: (train[index], -index))
        selected = curves[f"t{chosen}"].returns(*fold.test)
        reference = curves[baseline].returns(*fold.test)
        edge = (compounded(selected) - compounded(reference)) * 100.0
        selected_drawdown = max_drawdown_percent(selected)
        reference_drawdown = max_drawdown_percent(reference)
        diffs.extend(a - b for a, b in zip(selected, reference, strict=True))
        rows.append(
            {
                **fold.as_dict(),
                "selected": {
                    "trial": chosen,
                    "params": dict(assignments[chosen]),
                    "in_sample_sharpe": train[chosen],
                },
                "oos": {
                    "selected_roi_percent": compounded(selected) * 100.0,
                    "reference_roi_percent": compounded(reference) * 100.0,
                    "edge_pp": edge,
                    "win": edge > 0.0,
                    "selected_max_drawdown_percent": selected_drawdown,
                    "reference_max_drawdown_percent": reference_drawdown,
                    # Negative: the selected trial fell further than the reference.
                    "max_drawdown_pp": selected_drawdown - reference_drawdown,
                },
            }
        )
    return rows, diffs


def _normalized_points(
    space: SearchSpace,
    assignments: Sequence[Mapping[str, Any]],
) -> list[list[float]]:
    """Each assignment as a vector with every parameter scaled to ``[0, 1]``."""
    columns: list[list[float]] = []
    for parameter in space.parameters:
        raw = [assignment[parameter.pointer] for assignment in assignments]
        numbers = [float(value) for value in raw]
        low, high = min(numbers), max(numbers)
        columns.append(
            [(value - low) / (high - low) if high > low else 0.0 for value in numbers]
        )
    return [list(point) for point in zip(*columns, strict=True)]


def _record(
    ledger: Ledger,
    sweep_id: str,
    identity: Mapping[str, Any],
    spec: StrategySpec,
    specs: Sequence[StrategySpec],
    assignments: Sequence[Mapping[str, Any]],
    scores: Sequence[float],
) -> None:
    for trial, assignment, score in zip(specs, assignments, scores, strict=True):
        ledger.append(
            "sweep_trial",
            sweep=sweep_id,
            spec={"ref": spec_ref(trial), "behavior_hash": behavior_hash(trial)},
            bundle=identity["bundle"],
            eval_config_hash=identity["eval_config_hash"],
            params=dict(assignment),
            sharpe=round(score, _DECIMALS),
        )
    ledger.append("sweep", sweep=sweep_id, trials=len(specs), **identity)


def _span(value: tuple[Any, Any]) -> dict[str, str]:
    return {"start": value[0].isoformat(), "end": value[1].isoformat()}


def _warnings(bundle: Bundle) -> list[str]:
    warnings = [
        "The best trial is the best of a search, chosen in sample: it is not "
        "validated. Read the fold results and the deflated Sharpe, not its ROI."
    ]
    if bundle.manifest.source == "synthetic":
        warnings.append(SYNTHETIC_WARNING)
    return warnings


__all__ = [
    "INSUFFICIENT",
    "MAX_TRIALS",
    "METHODS",
    "OK",
    "Parameter",
    "SearchSpace",
    "SpaceError",
    "SweepConfig",
    "apply",
    "check_space",
    "load_space",
    "parse_space",
    "sample",
    "sweep",
]
