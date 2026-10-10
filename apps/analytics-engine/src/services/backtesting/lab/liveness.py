"""Which knobs of a spec change what the strategy does.

A tunable parameter that changes no decision on any history is a lie in the
spec: sweeping it searches nothing (the review found nine of the fifteen public
parameters like that). The check perturbs every tunable leaf of a spec, down and
up, runs each variant over the same bars as the spec and compares the decision
traces day by day:

- ``live``: some perturbation changes a decision on a primary bundle;
- ``dormant``: only the stress history shows a difference (the knob matters in
  rare conditions, such as a price touching its average);
- ``dead``: no perturbation changes any decision anywhere;
- ``unprobed``: every perturbation breaks the spec's own rules.

A live leaf is ``one_sided`` when only one direction changes anything: the other
direction is masked, for instance a cooldown that another one already exceeds.
"""

from __future__ import annotations

from collections.abc import Collection, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel
from pydantic.fields import FieldInfo

from src.services.backtesting.lab import pointers
from src.services.backtesting.lab.bundle import Bundle
from src.services.backtesting.lab.diff import first_divergence
from src.services.backtesting.lab.runner import EvalConfig, prepare, run_specs
from src.services.backtesting.spec import StrategySpec, parse_spec
from src.services.backtesting.spec.validation import SpecError

BASE = "base"
LIVE = "live"
DORMANT = "dormant"
DEAD = "dead"
UNPROBED = "unprobed"
# Lists whose elements are named by their ``id`` (or ``kind``) in a pointer.
_KEYED_LISTS = frozenset({"rules", "overlays", "guards"})
_DECIMALS = 6
# How far a float at zero moves, as a share of the span its bounds allow (or of 1).
_ZERO_STEP_SHARE = 0.1


@dataclass(frozen=True)
class Leaf:
    """One tunable value of a spec and the bounds its model allows."""

    pointer: str
    value: Any
    low: float | None = None
    low_open: bool = False
    high: float | None = None
    high_open: bool = False


def tunable_leaves(spec: StrategySpec) -> list[Leaf]:
    return list(_walk(spec, ""))


def _walk(model: BaseModel, prefix: str) -> Iterator[Leaf]:
    for name, info in type(model).model_fields.items():
        value = getattr(model, name)
        path = f"{prefix}/{name}"
        if _is_tunable(info):
            if value is not None:
                yield _leaf(path, value, info)
        elif isinstance(value, BaseModel):
            yield from _walk(value, path)
        elif isinstance(value, tuple):
            for index, item in enumerate(value):
                if isinstance(item, BaseModel):
                    yield from _walk(item, _element_path(prefix, name, index, item))


def _is_tunable(info: FieldInfo) -> bool:
    extra = info.json_schema_extra
    return isinstance(extra, dict) and bool(extra.get("x-tunable"))


def _element_path(prefix: str, name: str, index: int, item: BaseModel) -> str:
    if name in _KEYED_LISTS:
        key = getattr(item, "id", None) or getattr(item, "kind", None)
        return f"{prefix}/{name}[{key}]"
    return f"{prefix}/{name}/{index}"


def _leaf(path: str, value: Any, info: FieldInfo) -> Leaf:
    bounds: dict[str, Any] = {}
    for constraint in info.metadata:
        for attribute, key, is_open in (
            ("ge", "low", False),
            ("gt", "low", True),
            ("le", "high", False),
            ("lt", "high", True),
        ):
            limit = getattr(constraint, attribute, None)
            if limit is not None:
                bounds[key] = float(limit)
                bounds[f"{key}_open"] = is_open
    return Leaf(path, value, **bounds)


def perturbations(leaf: Leaf) -> dict[str, Any]:
    """The values worth trying instead of ``leaf.value``, by direction.

    Numbers move by half and by half again as much; a float at zero has nothing
    to scale, so it moves by a tenth of the span its bounds allow.
    """
    value = leaf.value
    if isinstance(value, bool):
        return {"flip": not value}
    candidates: dict[str, Any]
    if isinstance(value, int):
        candidates = {"down": value // 2, "up": value * 2 if value else 1}
    elif value == 0.0:
        step = _zero_step(leaf)
        candidates = {"down": -step, "up": step}
    else:
        candidates = {"down": value * 0.5, "up": value * 1.5}
    fitted = {
        direction: _fit(candidate, leaf, integer=isinstance(value, int))
        for direction, candidate in candidates.items()
    }
    return {
        direction: candidate
        for direction, candidate in fitted.items()
        if candidate is not None and candidate != value
    }


def _zero_step(leaf: Leaf) -> float:
    if leaf.low is None or leaf.high is None:
        return _ZERO_STEP_SHARE
    return _ZERO_STEP_SHARE * (leaf.high - leaf.low)


def _fit(candidate: float, leaf: Leaf, *, integer: bool) -> float | None:
    """``candidate`` brought inside the leaf's bounds; ``None`` if nothing fits."""
    fitted = float(candidate)
    if _below(fitted, leaf):
        fitted = _edge(leaf.low, leaf.low_open, leaf.value, integer, step=1)
    if _above(fitted, leaf):
        fitted = _edge(leaf.high, leaf.high_open, leaf.value, integer, step=-1)
    if not integer:
        fitted = round(fitted, _DECIMALS)
    if _below(fitted, leaf) or _above(fitted, leaf):
        return None
    return int(fitted) if integer else fitted


def _below(candidate: float, leaf: Leaf) -> bool:
    return leaf.low is not None and (
        candidate < leaf.low or (leaf.low_open and candidate <= leaf.low)
    )


def _above(candidate: float, leaf: Leaf) -> bool:
    return leaf.high is not None and (
        candidate > leaf.high or (leaf.high_open and candidate >= leaf.high)
    )


def _edge(
    bound: float | None,
    is_open: bool,
    value: float,
    integer: bool,
    *,
    step: int,
) -> float:
    """The nearest allowed value to ``bound``: the bound, or just inside it."""
    assert bound is not None
    if not is_open:
        return bound
    if integer:
        return bound + step
    # The current value is inside the bounds, so halfway to it is too.
    return (bound + value) / 2


@dataclass(frozen=True)
class Probe:
    """One perturbed spec, or the reason it cannot exist."""

    leaf: Leaf
    direction: str
    value: Any
    spec: StrategySpec | None
    invalid: str | None = None


def probes(spec: StrategySpec, only: Sequence[str] | None = None) -> list[Probe]:
    raw = spec.model_dump(mode="json")
    found: list[Probe] = []
    for leaf in tunable_leaves(spec):
        if not _selected(leaf.pointer, only):
            continue
        for direction, value in perturbations(leaf).items():
            try:
                changed = parse_spec(pointers.set_at(raw, leaf.pointer, value))
            except SpecError as error:
                found.append(Probe(leaf, direction, value, None, str(error)))
            else:
                found.append(Probe(leaf, direction, value, changed))
    return found


def _selected(pointer: str, only: Sequence[str] | None) -> bool:
    return not only or any(pointer.startswith(prefix) for prefix in only)


@dataclass
class LeafResult:
    pointer: str
    value: Any
    status: str = UNPROBED
    one_sided: bool = False
    probes: list[dict[str, Any]] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "pointer": self.pointer,
            "value": self.value,
            "status": self.status,
            "one_sided": self.one_sided,
            "probes": self.probes,
        }


class NoDaysError(ValueError):
    """A history yields no days in the evaluated window, so it proves nothing."""


@dataclass(frozen=True)
class LivenessReport:
    bundles: list[str]
    primary: list[str]
    # How many days each history was run over: the evidence behind a verdict.
    days: dict[str, int]
    leaves: list[LeafResult]

    @property
    def counts(self) -> dict[str, int]:
        return {
            status: sum(1 for leaf in self.leaves if leaf.status == status)
            for status in (LIVE, DORMANT, DEAD, UNPROBED)
        }

    def as_dict(self) -> dict[str, Any]:
        return {
            "bundles": self.bundles,
            "primary": self.primary,
            "days": self.days,
            "summary": self.counts,
            "leaves": [leaf.as_dict() for leaf in self.leaves],
        }


def liveness(
    spec: StrategySpec,
    bundles: Mapping[str, Bundle],
    primary: Collection[str],
    config: EvalConfig | None = None,
    *,
    only: Sequence[str] | None = None,
) -> LivenessReport:
    """Classify every tunable leaf of ``spec`` across the given bundles."""
    config = config or EvalConfig()
    found = probes(spec, only)
    runnable = {f"p{index}": probe for index, probe in enumerate(found) if probe.spec}
    changed: dict[str, dict[str, int]] = {key: {} for key in runnable}
    days: dict[str, int] = {}
    for ref, bundle in bundles.items():
        response = run_specs(
            {
                BASE: spec,
                **{key: probe.spec for key, probe in runnable.items() if probe.spec},
            },
            prepare(bundle, config),
            config,
        )
        days[ref] = len(response.timeline)
        if not days[ref]:
            raise NoDaysError(f"{ref} has no days in the window to run over")
        for key in runnable:
            changed[key][ref] = first_divergence(response, BASE, key)[1]
    results = {
        leaf.pointer: LeafResult(leaf.pointer, leaf.value)
        for leaf in tunable_leaves(spec)
        if _selected(leaf.pointer, only)
    }
    for index, probe in enumerate(found):
        leaf = results[probe.leaf.pointer]
        evidence = changed.get(f"p{index}", {})
        leaf.probes.append(
            {
                "direction": probe.direction,
                "value": probe.value,
                "invalid": probe.invalid,
                "days_differing": evidence,
            }
        )
    for leaf in results.values():
        _classify(leaf, set(primary))
    return LivenessReport(list(bundles), sorted(primary), days, list(results.values()))


def _classify(leaf: LeafResult, primary: set[str]) -> None:
    valid = [probe for probe in leaf.probes if probe["invalid"] is None]
    if not valid:
        leaf.status = UNPROBED
        return
    on_primary = [
        any(days for ref, days in probe["days_differing"].items() if ref in primary)
        for probe in valid
    ]
    elsewhere = any(
        days
        for probe in valid
        for ref, days in probe["days_differing"].items()
        if ref not in primary
    )
    if any(on_primary):
        leaf.status = LIVE
        leaf.one_sided = len(valid) > 1 and sum(on_primary) == 1
    elif elsewhere:
        leaf.status = DORMANT
    else:
        leaf.status = DEAD


__all__ = [
    "BASE",
    "DEAD",
    "DORMANT",
    "LIVE",
    "Leaf",
    "LeafResult",
    "LivenessReport",
    "NoDaysError",
    "Probe",
    "UNPROBED",
    "liveness",
    "perturbations",
    "probes",
    "tunable_leaves",
]
