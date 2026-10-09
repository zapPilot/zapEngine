"""What changed between two specs, and where the change first shows.

``spec_diff`` is structural: it addresses rules, overlays and guards by name, not
by position, so moving a rule is one change and not a cascade of edits.
``compare_on_bundle`` runs both specs over the same data and finds the first day
their decisions part ways, which is where to look when a change moves the
numbers.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from src.models.backtesting import BacktestResponse
from src.services.backtesting.lab.bundle import Bundle
from src.services.backtesting.lab.evaluate import spec_ref, strategy_metrics
from src.services.backtesting.lab.report import normalize
from src.services.backtesting.lab.runner import EvalConfig, prepare, run_specs
from src.services.backtesting.spec import StrategySpec, behavior_hash

# Lists of objects that are addressed by a field, not by position.
_KEYED_LISTS = {"rules": "id", "overlays": "id", "guards": "kind"}
BASE = "base"
CANDIDATE = "candidate"


@dataclass(frozen=True)
class SpecChange:
    pointer: str
    kind: str
    before: Any = None
    after: Any = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "pointer": self.pointer,
            "kind": self.kind,
            "before": self.before,
            "after": self.after,
        }


def spec_diff(base: StrategySpec, candidate: StrategySpec) -> list[SpecChange]:
    """Every difference, as JSON pointers; rules appear as ``/rules[<id>]/...``."""
    changes: list[SpecChange] = []
    _diff_object(
        "", base.model_dump(mode="json"), candidate.model_dump(mode="json"), changes
    )
    return changes


def _diff_object(
    path: str,
    base: Mapping[str, Any],
    candidate: Mapping[str, Any],
    changes: list[SpecChange],
) -> None:
    for key in sorted({*base, *candidate}):
        pointer = f"{path}/{key}"
        if key not in candidate:
            changes.append(SpecChange(pointer, "removed", before=base[key]))
        elif key not in base:
            changes.append(SpecChange(pointer, "added", after=candidate[key]))
        else:
            _diff_value(pointer, key, base[key], candidate[key], changes)


def _diff_value(
    pointer: str,
    key: str,
    before: Any,
    after: Any,
    changes: list[SpecChange],
) -> None:
    if before == after:
        return
    if isinstance(before, Mapping) and isinstance(after, Mapping):
        _diff_object(pointer, before, after, changes)
    elif key in _KEYED_LISTS:
        _diff_keyed(pointer, _KEYED_LISTS[key], before, after, changes)
    else:
        changes.append(SpecChange(pointer, "changed", before=before, after=after))


def _diff_keyed(
    pointer: str,
    field: str,
    before: Sequence[Mapping[str, Any]],
    after: Sequence[Mapping[str, Any]],
    changes: list[SpecChange],
) -> None:
    old = {item[field]: item for item in before}
    new = {item[field]: item for item in after}
    for name in [*old, *(name for name in new if name not in old)]:
        item_pointer = f"{pointer}[{name}]"
        if name not in new:
            changes.append(SpecChange(item_pointer, "removed", before=old[name]))
        elif name not in old:
            changes.append(SpecChange(item_pointer, "added", after=new[name]))
        else:
            _diff_object(item_pointer, old[name], new[name], changes)
    common_before = [name for name in old if name in new]
    common_after = [name for name in new if name in old]
    if common_before != common_after:
        changes.append(
            SpecChange(pointer, "reordered", before=common_before, after=common_after)
        )


@dataclass(frozen=True)
class Divergence:
    """The first day two strategies decided differently."""

    date: str
    base: dict[str, Any]
    candidate: dict[str, Any]

    def as_dict(self) -> dict[str, Any]:
        return {"date": self.date, "base": self.base, "candidate": self.candidate}


def _decision(state: Any) -> dict[str, Any]:
    return {
        "rule": state.decision.details.get("matched_rule_name"),
        "action": state.decision.action,
        "target": {
            asset: round(weight, 6)
            for asset, weight in state.decision.target_allocation.model_dump().items()
        },
        "transfers": [
            [item.from_bucket, item.to_bucket, round(item.amount_usd, 4)]
            for item in state.execution.transfers
        ],
    }


def first_divergence(
    response: BacktestResponse,
    base_key: str,
    candidate_key: str,
) -> tuple[Divergence | None, int]:
    """The first differing day (if any) and how many days differ in all."""
    first: Divergence | None = None
    differing = 0
    for point in response.timeline:
        base = _decision(point.strategies[base_key])
        candidate = _decision(point.strategies[candidate_key])
        if base == candidate:
            continue
        differing += 1
        if first is None:
            first = Divergence(point.market.date.isoformat(), base, candidate)
    return first, differing


def compare_on_bundle(
    base: StrategySpec,
    candidate: StrategySpec,
    bundle: Bundle,
    config: EvalConfig | None = None,
) -> dict[str, Any]:
    """Both specs over the same data: how the numbers move and where they part."""
    config = config or EvalConfig()
    response = run_specs(
        {BASE: base, CANDIDATE: candidate}, prepare(bundle, config), config
    )
    divergence, days_differing = first_divergence(response, BASE, CANDIDATE)
    metrics = {key: strategy_metrics(response, key) for key in (BASE, CANDIDATE)}
    result: dict[str, Any] = normalize(
        {
            "base": {"ref": spec_ref(base), **metrics[BASE]},
            "candidate": {"ref": spec_ref(candidate), **metrics[CANDIDATE]},
            "roi_pp": metrics[CANDIDATE]["roi_percent"] - metrics[BASE]["roi_percent"],
            "max_drawdown_pp": metrics[CANDIDATE]["max_drawdown_percent"]
            - metrics[BASE]["max_drawdown_percent"],
            "days": len(response.timeline),
            "days_differing": days_differing,
            "first_divergence": None if divergence is None else divergence.as_dict(),
        }
    )
    return result


def behavior_changed(base: StrategySpec, candidate: StrategySpec) -> bool:
    return behavior_hash(base) != behavior_hash(candidate)


__all__ = [
    "BASE",
    "CANDIDATE",
    "Divergence",
    "SpecChange",
    "behavior_changed",
    "compare_on_bundle",
    "first_divergence",
    "spec_diff",
]
