"""Turns raw spec JSON into a validated spec, or into issues an author can fix.

Every issue points at the offending value with a JSON pointer and carries a
stable code, so a tool (or an LLM) can repair the spec without parsing prose.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from itertools import pairwise

from pydantic import ValidationError

from src.services.backtesting.spec.common import ProceedsSpec
from src.services.backtesting.spec.model import StrategySpec
from src.services.backtesting.spec.rules import (
    RULE_KINDS,
    DmaCrossDownExit,
    DmaOverextensionTrim,
    FgiDownshiftTrim,
    RatioCrossRotation,
    RatioDeviationRotation,
    RotationLeg,
    RuleModel,
    TechnicalTrim,
)
from src.services.backtesting.spec.triggers import TRIGGER_SIGNALS

_SHARE_TOLERANCE = 1e-9


@dataclass(frozen=True)
class SpecIssue:
    pointer: str
    code: str
    message: str

    def as_dict(self) -> dict[str, str]:
        return {"pointer": self.pointer, "code": self.code, "message": self.message}


class SpecError(ValueError):
    """A spec that cannot be used; ``issues`` says why."""

    def __init__(self, issues: Sequence[SpecIssue]) -> None:
        self.issues = tuple(issues)
        super().__init__(
            "; ".join(f"{issue.pointer or '/'}: {issue.message}" for issue in issues)
        )


def parse_spec(raw: object) -> StrategySpec:
    """Validate ``raw`` structurally, then semantically."""
    try:
        spec = StrategySpec.model_validate(raw)
    except ValidationError as error:
        raise SpecError(_structural_issues(error)) from error
    require_valid(spec)
    return spec


def require_valid(spec: StrategySpec) -> None:
    issues = semantic_issues(spec)
    if issues:
        raise SpecError(issues)


def _structural_issues(error: ValidationError) -> list[SpecIssue]:
    return [
        SpecIssue(
            pointer=_pointer(_without_kind_tags(item["loc"])),
            code=str(item["type"]),
            message=str(item["msg"]),
        )
        for item in error.errors()
    ]


def _without_kind_tags(location: tuple[int | str, ...]) -> list[int | str]:
    """Drop the union tags pydantic inserts: after a list index and after a trigger."""
    kept: list[int | str] = []
    for part in location:
        if kept and isinstance(kept[-1], int) and part in RULE_KINDS:
            continue
        if kept and kept[-1] == "trigger" and part in TRIGGER_SIGNALS:
            continue
        kept.append(part)
    return kept


def _pointer(parts: Sequence[int | str]) -> str:
    return "".join(f"/{part}" for part in parts)


def semantic_issues(spec: StrategySpec) -> list[SpecIssue]:
    """Problems the field types cannot express."""
    issues: list[SpecIssue] = []
    issues.extend(_duplicate_ids(spec))
    for index, rule in enumerate(spec.rules):
        issues.extend(_rule_issues(f"/rules/{index}", rule))
    issues.extend(_guard_issues(spec))
    if len(spec.overlays) > 1:
        issues.append(
            SpecIssue("/overlays/1", "duplicate_overlay", "Only one overlay is allowed")
        )
    return issues


def _duplicate_ids(spec: StrategySpec) -> Iterator[SpecIssue]:
    entries = [
        *((f"/rules/{index}/id", rule.id) for index, rule in enumerate(spec.rules)),
        *(
            (f"/overlays/{index}/id", overlay.id)
            for index, overlay in enumerate(spec.overlays)
        ),
    ]
    seen: set[str] = set()
    for pointer, name in entries:
        if name in seen:
            yield SpecIssue(pointer, "duplicate_id", f"'{name}' is already used")
        seen.add(name)


def _rule_issues(pointer: str, rule: RuleModel) -> Iterator[SpecIssue]:
    if isinstance(rule, DmaCrossDownExit):
        yield from _cross_down_issues(pointer, rule)
    elif isinstance(rule, RatioCrossRotation):
        yield from _rotation_leg_issues(f"{pointer}/cross_up", rule.cross_up)
        yield from _rotation_leg_issues(f"{pointer}/cross_down", rule.cross_down)
    elif isinstance(rule, RatioDeviationRotation):
        yield from _deviation_issues(pointer, rule)
    elif isinstance(rule, DmaOverextensionTrim | TechnicalTrim):
        yield from _proceeds_issues(f"{pointer}/proceeds", rule.proceeds)
    elif isinstance(rule, FgiDownshiftTrim):
        yield from _fgi_downshift_issues(pointer, rule)


def _cross_down_issues(pointer: str, rule: DmaCrossDownExit) -> Iterator[SpecIssue]:
    yield from _proceeds_issues(f"{pointer}/proceeds", rule.proceeds)
    for index, group in enumerate(rule.peer_groups):
        if not group:
            yield SpecIssue(
                f"{pointer}/peer_groups/{index}",
                "empty_peer_group",
                "A peer group needs at least one asset",
            )
    counts = Counter(asset for group in rule.peer_groups for asset in group)
    for asset, count in counts.items():
        if count > 1:
            yield SpecIssue(
                f"{pointer}/peer_groups",
                "asset_in_two_groups",
                f"{asset} appears {count} times; an asset belongs to one group",
            )


def _rotation_leg_issues(pointer: str, leg: RotationLeg) -> Iterator[SpecIssue]:
    if not leg.sources:
        yield SpecIssue(f"{pointer}/sources", "no_sources", "A rotation needs a source")
    if len(set(leg.sources)) != len(leg.sources):
        yield SpecIssue(
            f"{pointer}/sources", "duplicate_source", "A source is listed twice"
        )
    if leg.destination in leg.sources:
        yield SpecIssue(
            f"{pointer}/destination",
            "destination_is_source",
            f"{leg.destination} cannot be both swept and the destination",
        )


def _deviation_issues(
    pointer: str,
    rule: RatioDeviationRotation,
) -> Iterator[SpecIssue]:
    thresholds = [tier.threshold for tier in rule.tiers]
    if any(stronger <= weaker for stronger, weaker in pairwise(thresholds)):
        yield SpecIssue(
            f"{pointer}/tiers",
            "tiers_not_strongest_first",
            "Thresholds must be strictly decreasing, strongest tier first",
        )
    names = Counter(tier.name for tier in rule.tiers)
    for index, tier in enumerate(rule.tiers):
        if names[tier.name] > 1:
            yield SpecIssue(
                f"{pointer}/tiers/{index}/name",
                "duplicate_tier_name",
                f"Tier name '{tier.name}' is used more than once",
            )
    if rule.below is None and rule.above is None:
        yield SpecIssue(
            pointer, "no_active_leg", "At least one of below and above must be set"
        )
    for side, leg in (("below", rule.below), ("above", rule.above)):
        if leg is not None and leg.source == leg.destination:
            yield SpecIssue(
                f"{pointer}/{side}",
                "leg_moves_nothing",
                f"{leg.source} cannot be both source and destination",
            )


def _fgi_downshift_issues(
    pointer: str,
    rule: FgiDownshiftTrim,
) -> Iterator[SpecIssue]:
    yield from _proceeds_issues(f"{pointer}/proceeds", rule.proceeds)
    for side, regimes in (
        ("from_regimes", rule.from_regimes),
        ("to_regimes", rule.to_regimes),
    ):
        if len(set(regimes)) != len(regimes):
            yield SpecIssue(
                f"{pointer}/{side}", "duplicate_regime", "A regime is listed twice"
            )
    if set(rule.from_regimes) & set(rule.to_regimes):
        yield SpecIssue(
            pointer,
            "regimes_overlap",
            "A regime cannot be both a source and a destination of the downshift",
        )


def _proceeds_issues(pointer: str, proceeds: ProceedsSpec) -> Iterator[SpecIssue]:
    assets = [part.asset for part in proceeds.to]
    if len(set(assets)) != len(assets):
        yield SpecIssue(
            f"{pointer}/to", "duplicate_proceeds_asset", "An asset is routed twice"
        )
    if sum(part.share for part in proceeds.to) > 1.0 + _SHARE_TOLERANCE:
        yield SpecIssue(
            f"{pointer}/to", "proceeds_exceed_one", "Shares add up to more than 1"
        )


def _guard_issues(spec: StrategySpec) -> Iterator[SpecIssue]:
    for index, guard in enumerate(spec.guards):
        pointer = f"/guards/{index}"
        if index > 0:
            yield SpecIssue(
                pointer, "duplicate_guard", "Only one trade_quota guard is allowed"
            )
        if (
            guard.min_trade_interval_days is None
            and guard.max_trades_7d is None
            and guard.max_trades_30d is None
        ):
            yield SpecIssue(pointer, "empty_guard", "A guard needs at least one limit")


__all__ = [
    "SpecError",
    "SpecIssue",
    "parse_spec",
    "require_valid",
    "semantic_issues",
]
