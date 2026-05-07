"""Fixture-backed event validation for backtesting timelines."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any

ASSET_KEYS = frozenset({"btc", "eth", "spy", "stable", "alt"})
CONSTRAINT_EPSILON = 1e-6


class ValidationEventError(ValueError):
    """Raised when a validation fixture or assertion is malformed."""


class ConstraintValidationFailed(Exception):
    """Raised after rendering output when selected constraints fail."""

    def __init__(self, rendered: str, validation: dict[str, Any]) -> None:
        super().__init__("Compare constraints failed.")
        self.rendered = rendered
        self.validation = validation


@dataclass(frozen=True)
class ValidationEvent:
    id: str
    event_date: str
    event_type: str
    assertions: tuple[dict[str, Any], ...]
    description: str = ""
    rationale: str = ""
    reference_asset: str | None = None
    applicable_strategies: tuple[str, ...] | None = None

    @classmethod
    def from_mapping(cls, raw: dict[str, Any]) -> ValidationEvent:
        applicable = raw.get("applicable_strategies")
        if applicable is not None:
            if not isinstance(applicable, list) or not all(
                isinstance(item, str) and item for item in applicable
            ):
                raise ValidationEventError(
                    f"Validation event {raw.get('id', 'unknown')} applicable_strategies must be a string array."
                )
            applicable_strategies = tuple(applicable)
        else:
            applicable_strategies = None

        assertions = raw.get("assertions")
        if not isinstance(assertions, list) or not assertions:
            raise ValidationEventError(
                f"Validation event {raw.get('id', 'unknown')} must define a non-empty assertions array."
            )
        normalized_assertions = []
        for assertion in assertions:
            if not isinstance(assertion, dict):
                raise ValidationEventError(
                    f"Validation event {raw.get('id', 'unknown')} assertions must be objects."
                )
            normalized_assertions.append(dict(assertion))

        event_id = raw.get("id")
        event_date = raw.get("event_date")
        event_type = raw.get("event_type")
        for key, value in {
            "id": event_id,
            "event_date": event_date,
            "event_type": event_type,
        }.items():
            if not isinstance(value, str) or not value:
                raise ValidationEventError(
                    f"Validation event must define non-empty string '{key}'."
                )
        assert isinstance(event_id, str)
        assert isinstance(event_date, str)
        assert isinstance(event_type, str)

        reference_asset = raw.get("reference_asset")
        description = raw.get("description")
        rationale = raw.get("rationale")
        return cls(
            id=event_id,
            event_date=event_date,
            event_type=event_type,
            assertions=tuple(normalized_assertions),
            description=description if isinstance(description, str) else "",
            rationale=rationale if isinstance(rationale, str) else "",
            reference_asset=reference_asset
            if isinstance(reference_asset, str) and reference_asset
            else None,
            applicable_strategies=applicable_strategies,
        )

    def applies_to(self, strategy_id: str | None) -> bool:
        if self.applicable_strategies is None or strategy_id is None:
            return True
        return strategy_id in self.applicable_strategies

    def to_case(self) -> dict[str, Any]:
        case: dict[str, Any] = {
            "id": self.id,
            "event_date": self.event_date,
            "event_type": self.event_type,
            "description": self.description,
            "rationale": self.rationale,
            "assertions": [dict(assertion) for assertion in self.assertions],
        }
        if self.reference_asset is not None:
            case["reference_asset"] = self.reference_asset
        if self.applicable_strategies is not None:
            case["applicable_strategies"] = list(self.applicable_strategies)
        return case


@dataclass(frozen=True)
class AssertionResult:
    assertion_type: str
    passed: bool
    message: str = "passed"


@dataclass(frozen=True)
class EventResult:
    id: str
    event_date: str
    event_type: str
    description: str
    rationale: str
    passed: bool
    status: str
    message: str
    assertions_checked: int

    @property
    def failure_message(self) -> str:
        return "" if self.passed else self.message

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "event_date": self.event_date,
            "event_type": self.event_type,
            "description": self.description,
            "rationale": self.rationale,
            "passed": self.passed,
            "status": self.status,
            "message": self.message,
            "assertions_checked": self.assertions_checked,
        }


def load_validation_events(
    path: Path,
    *,
    event_ids: list[str] | None = None,
) -> list[ValidationEvent]:
    if not path.exists():
        raise ValidationEventError(f"Constraints fixture not found: {path}")
    try:
        payload = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        raise ValidationEventError(
            f"Constraints fixture is not valid JSON: {path}"
        ) from exc
    if not isinstance(payload, dict):
        raise ValidationEventError("Constraints fixture root must be a JSON object.")

    events: list[ValidationEvent] = []
    for date_key, date_data in payload.items():
        if not isinstance(date_data, dict) or "events" not in date_data:
            raise ValidationEventError(
                f"Constraint case for date {date_key} must be an object with an 'events' array."
            )
        raw_events = date_data["events"]
        if not isinstance(raw_events, list):
            raise ValidationEventError(
                f"Constraint case for date {date_key} 'events' must be an array."
            )
        for index, raw_event in enumerate(raw_events):
            if not isinstance(raw_event, dict):
                raise ValidationEventError(
                    f"Constraint case at index {index} for date {date_key} must be an object."
                )
            event = dict(raw_event)
            event["event_date"] = date_key
            events.append(ValidationEvent.from_mapping(event))

    if not event_ids:
        return events

    selected = set(event_ids)
    filtered = [event for event in events if event.id in selected]
    missing = selected - {event.id for event in filtered}
    if missing:
        raise ValidationEventError(
            "Unknown constraint event id(s): " + ", ".join(sorted(missing))
        )
    return filtered


def evaluate_event(
    event: ValidationEvent,
    timeline: list[dict[str, Any] | Any],
) -> EventResult:
    return EventResult(
        **_validate_constraint_case(
            case=event.to_case(), points=_coerce_points(timeline)
        )
    )


def build_constraint_validation(
    *,
    points: list[dict[str, Any]],
    filtered_points: list[dict[str, Any]],
    fixture_path: str | Path | None,
    event_ids: list[str] | None,
    strategy_id: str | None = None,
) -> dict[str, Any]:
    if fixture_path is None:
        return {
            "enabled": False,
            "fixture": None,
            "passed": True,
            "checked": 0,
            "violations": [],
            "results": [],
            "skipped": [],
        }

    events = load_validation_events(Path(fixture_path), event_ids=event_ids)
    selected_dates = {str(point["date"]) for point in filtered_points}
    results: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for event in events:
        if not event.applies_to(strategy_id):
            skipped.append(
                {
                    "id": event.id,
                    "event_date": event.event_date,
                    "reason": f"not applicable to strategy {strategy_id}",
                }
            )
            continue
        if event.event_date not in selected_dates:
            skipped.append(
                {
                    "id": event.id,
                    "event_date": event.event_date,
                    "reason": "outside selected analysis window",
                }
            )
            continue
        results.append(evaluate_event(event, points).to_dict())

    violations = [result for result in results if not result["passed"]]
    return {
        "enabled": True,
        "fixture": str(Path(fixture_path)),
        "passed": not violations,
        "checked": len(results),
        "violations": violations,
        "results": results,
        "skipped": skipped,
    }


def assert_target_asset_equals(
    assertion: dict[str, Any],
    points: list[dict[str, Any]],
    event_point: dict[str, Any],
) -> str | None:
    del points
    return _constraint_asset_compare(
        assertion=assertion,
        point=event_point,
        comparator="equals",
    )


def assert_target_asset_increased_from_previous(
    assertion: dict[str, Any],
    points: list[dict[str, Any]],
    event_point: dict[str, Any],
) -> str | None:
    return _constraint_asset_vs_previous(
        assertion=assertion,
        point=event_point,
        previous_point=_previous_constraint_point(
            points=points, event_point=event_point
        ),
        comparator="greater_than",
    )


def assert_target_asset_decreased_from_previous(
    assertion: dict[str, Any],
    points: list[dict[str, Any]],
    event_point: dict[str, Any],
) -> str | None:
    return _constraint_asset_vs_previous(
        assertion=assertion,
        point=event_point,
        previous_point=_previous_constraint_point(
            points=points, event_point=event_point
        ),
        comparator="less_than",
    )


def _coerce_points(timeline: list[dict[str, Any] | Any]) -> list[dict[str, Any]]:
    points: list[dict[str, Any]] = []
    for raw in timeline:
        if isinstance(raw, dict):
            points.append(raw)
            continue
        model_dump = getattr(raw, "model_dump", None)
        if callable(model_dump):
            dumped = model_dump(mode="json")
            if isinstance(dumped, dict):
                points.append(dumped)
                continue
        raise ValidationEventError("Timeline points must be dict-like objects.")
    return points


def _validate_constraint_case(
    *,
    case: dict[str, Any],
    points: list[dict[str, Any]],
) -> dict[str, Any]:
    case_id = str(case["id"])
    event_date = str(case["event_date"])
    event_point = _point_for_date(points=points, event_date=event_date)
    base_result: dict[str, Any] = {
        "id": case_id,
        "event_date": event_date,
        "event_type": case["event_type"],
        "description": case.get("description")
        if isinstance(case.get("description"), str)
        else "",
        "rationale": case.get("rationale")
        if isinstance(case.get("rationale"), str)
        else "",
        "passed": False,
        "status": "FAIL",
        "message": "",
        "assertions_checked": 0,
    }
    if event_point is None:
        return {
            **base_result,
            "message": f"{event_date}: no compare timeline point found",
        }

    skip_reason = _maybe_precondition_skip(case, points, event_point)
    if skip_reason is not None:
        return {
            **base_result,
            "passed": True,
            "status": "SKIPPED",
            "message": skip_reason,
        }

    trigger_failure = _constraint_event_trigger_failure(
        case=case,
        point=event_point,
        points=points,
    )
    if trigger_failure is not None:
        return {**base_result, "message": trigger_failure}

    assertions = [
        assertion
        for assertion in case.get("assertions", [])
        if isinstance(assertion, dict)
    ]
    if not assertions:
        return {**base_result, "message": "No assertions defined for constraint case"}

    for assertion in assertions:
        failure = _evaluate_constraint_assertion(
            assertion=assertion,
            points=points,
            event_point=event_point,
        )
        if failure is not None:
            return {
                **base_result,
                "message": failure,
                "assertions_checked": len(assertions),
            }
    return {
        **base_result,
        "passed": True,
        "status": "PASS",
        "message": "passed",
        "assertions_checked": len(assertions),
    }


def _maybe_precondition_skip(
    event: dict[str, Any],
    points: list[dict[str, Any]],
    point: dict[str, Any],
) -> str | None:
    event_type = event.get("event_type")
    if event_type not in {"crypto_cross_down", "spy_cross_down"}:
        return None

    reference = _optional_upper(event.get("reference_asset"))
    if reference is None and event_type == "spy_cross_down":
        reference = "SPY"
    if reference is None:
        return None

    previous = _previous_constraint_point(points=points, event_point=point)
    if previous is None:
        return None

    target = _safe_mapping(_constraint_decision(previous).get("target_allocation"))
    reference_key = reference.lower()
    if reference_key not in target:
        return None
    prev_alloc = _constraint_number(target.get(reference_key))
    if abs(prev_alloc) < 1e-9:
        return (
            f"reference asset {reference} already at 0.0 in previous target_allocation; "
            "peer-group/earlier exit covered this cross_down"
        )
    return None


def _constraint_event_trigger_failure(
    *,
    case: dict[str, Any],
    point: dict[str, Any],
    points: list[dict[str, Any]],
) -> str | None:
    event_type = str(case["event_type"])
    if event_type == "crypto_cross_down":
        return _crypto_cross_trigger_failure(
            point=point,
            expected_cross="cross_down",
            reference_asset=_optional_upper(case.get("reference_asset")),
        )
    if event_type == "crypto_cross_up":
        return _crypto_cross_trigger_failure(
            point=point,
            expected_cross="cross_up",
            reference_asset=_optional_upper(case.get("reference_asset")),
        )
    if event_type == "spy_cross_down":
        return _dma_cross_trigger_failure(
            point=point,
            dma_key="spy_dma",
            expected_cross="cross_down",
        )
    if event_type == "spy_cross_up":
        return _dma_cross_trigger_failure(
            point=point,
            dma_key="spy_dma",
            expected_cross="cross_up",
        )
    if event_type == "extreme_fear_below_crypto_dma":
        label = _constraint_sentiment_label(point)
        dma = _constraint_dma(point, key="dma")
        if label == "extreme_fear" and dma.get("zone") == "below":
            return None
        return _constraint_failure(
            point,
            "expected extreme_fear sentiment with crypto DMA zone below; "
            f"observed sentiment={label!r}, dma_zone={dma.get('zone')!r}",
        )
    if event_type == "extreme_fear_below_spy_dma":
        label = _constraint_macro_sentiment_label(point)
        spy_dma = _constraint_dma(point, key="spy_dma")
        if label == "extreme_fear" and spy_dma.get("zone") == "below":
            return None
        return _constraint_failure(
            point,
            "expected SPY extreme fear below DMA; "
            f"observed label={label!r}, zone={spy_dma.get('zone')!r}",
        )
    if event_type == "crypto_dma_fgi_sell":
        reason = _constraint_decision(point).get("reason")
        if isinstance(reason, str) and "crypto_" in reason and "sell" in reason:
            return None
        return _constraint_failure(
            point,
            f"expected crypto DMA/FGI sell; observed reason={reason!r}",
        )
    if event_type == "eth_btc_ratio_cross_up":
        return _inner_ratio_cross_trigger_failure(
            points=points,
            point=point,
            from_zone="below",
            to_zone="above",
        )
    if event_type == "eth_btc_ratio_cross_down":
        return _inner_ratio_cross_trigger_failure(
            points=points,
            point=point,
            from_zone="above",
            to_zone="below",
        )
    if event_type == "decision_action_assertion":
        return None
    return _constraint_failure(
        point,
        f"Unsupported constraint event type: {event_type!r}",
    )


def _crypto_cross_trigger_failure(
    *,
    point: dict[str, Any],
    expected_cross: str,
    reference_asset: str | None,
) -> str | None:
    failure = _dma_cross_trigger_failure(
        point=point,
        dma_key="dma",
        expected_cross=expected_cross,
    )
    if failure is not None:
        return failure
    if reference_asset is None:
        return None
    dma = _constraint_dma(point, key="dma")
    observed_reference = _optional_upper(
        dma.get("outer_dma_reference_asset") or dma.get("outer_dma_asset")
    )
    if observed_reference == reference_asset:
        return None
    return _constraint_failure(
        point,
        f"expected crypto DMA reference {reference_asset}; observed {observed_reference!r}",
    )


def _dma_cross_trigger_failure(
    *,
    point: dict[str, Any],
    dma_key: str,
    expected_cross: str,
) -> str | None:
    dma = _constraint_dma(point, key=dma_key)
    observed = dma.get("cross_event")
    if observed == expected_cross:
        return None
    return _constraint_failure(
        point,
        f"expected {dma_key} cross_event={expected_cross!r}; observed {observed!r}",
    )


def _inner_ratio_cross_trigger_failure(
    *,
    points: list[dict[str, Any]],
    point: dict[str, Any],
    from_zone: str,
    to_zone: str,
) -> str | None:
    previous_point = _previous_constraint_point(points=points, event_point=point)
    if previous_point is None:
        return _constraint_failure(
            point,
            "No previous point available for ratio-cross event trigger",
        )
    previous = _constraint_inner_ratio_zone(previous_point)
    observed = _constraint_inner_ratio_zone(point)
    if previous == from_zone and observed == to_zone:
        return None
    return _constraint_failure(
        point,
        f"expected inner ratio zone transition {from_zone!r}->{to_zone!r}; "
        f"observed {previous!r}->{observed!r}",
    )


def _evaluate_constraint_assertion(
    *,
    assertion: dict[str, Any],
    points: list[dict[str, Any]],
    event_point: dict[str, Any],
) -> str | None:
    assertion_type = assertion.get("type")
    previous_point = _previous_constraint_point(points=points, event_point=event_point)
    if assertion_type == "target_asset_equals":
        return assert_target_asset_equals(assertion, points, event_point)
    if assertion_type in {"target_asset_greater_than", "target_asset_gt"}:
        return _constraint_asset_compare(
            assertion=assertion,
            point=event_point,
            comparator="greater_than",
        )
    if assertion_type == "target_asset_gte":
        return _constraint_asset_compare(
            assertion=assertion,
            point=event_point,
            comparator="greater_than_or_equal",
        )
    if assertion_type in {
        "target_asset_greater_than_previous",
        "target_asset_increased_from_previous",
    }:
        return assert_target_asset_increased_from_previous(
            assertion,
            points,
            event_point,
        )
    if assertion_type in {
        "target_asset_less_than_previous",
        "target_asset_decreased_from_previous",
    }:
        return assert_target_asset_decreased_from_previous(
            assertion,
            points,
            event_point,
        )
    if assertion_type in {
        "target_asset_not_greater_than_previous",
        "target_asset_not_increased_from_previous",
    }:
        return _constraint_asset_vs_previous(
            assertion=assertion,
            point=event_point,
            previous_point=previous_point,
            comparator="not_greater_than",
        )
    if assertion_type in {
        "target_asset_not_greater_than_current",
        "target_asset_not_increased_from_current",
    }:
        return _constraint_asset_vs_current(
            assertion=assertion,
            point=event_point,
            comparator="not_greater_than",
        )
    if assertion_type in {
        "target_crypto_greater_than_previous",
        "target_crypto_increased_from_previous",
    }:
        return _constraint_crypto_vs_previous(
            point=event_point,
            previous_point=previous_point,
            comparator="greater_than",
        )
    if assertion_type == "target_stable_decreased_from_previous":
        return _constraint_asset_vs_previous(
            assertion={"asset": "stable"},
            point=event_point,
            previous_point=previous_point,
            comparator="less_than",
        )
    if assertion_type == "target_stable_increased_from_previous":
        return _constraint_asset_vs_previous(
            assertion={"asset": "stable"},
            point=event_point,
            previous_point=previous_point,
            comparator="greater_than",
        )
    if assertion_type == "target_spy_not_increased_from_previous":
        return _constraint_asset_vs_previous(
            assertion={**assertion, "asset": "spy"},
            point=event_point,
            previous_point=previous_point,
            comparator="not_greater_than",
        )
    if assertion_type == "target_spy_not_greater_than_current":
        return _constraint_asset_vs_current(
            assertion={**assertion, "asset": "spy"},
            point=event_point,
            comparator="not_greater_than",
        )
    if assertion_type == "if_current_crypto_gt_target_asset_equals":
        return _constraint_if_current_crypto_gt_asset_compare(
            assertion=assertion,
            point=event_point,
            comparator="equals",
        )
    if assertion_type == "if_current_crypto_gt_target_asset_gt":
        return _constraint_if_current_crypto_gt_asset_compare(
            assertion=assertion,
            point=event_point,
            comparator="greater_than",
        )
    if assertion_type == "eventually_target_asset_greater_than_previous":
        return _constraint_eventual_asset_vs_previous(
            assertion=assertion,
            points=points,
            event_point=event_point,
            comparator="greater_than",
        )
    if assertion_type == "eventually_target_asset_less_than_previous":
        return _constraint_eventual_asset_vs_previous(
            assertion=assertion,
            points=points,
            event_point=event_point,
            comparator="less_than",
        )
    if assertion_type == "decision_action_in":
        return _constraint_decision_action_in(assertion=assertion, point=event_point)
    if assertion_type == "decision_action_equals":
        return _constraint_decision_action_equals(
            assertion=assertion,
            point=event_point,
        )
    if assertion_type == "matched_rule_name_not_equals":
        return _constraint_matched_rule_name_not_equals(
            assertion=assertion,
            point=event_point,
        )
    if assertion_type == "decision_reason_in":
        return _constraint_decision_reason_in(assertion=assertion, point=event_point)
    if assertion_type == "decision_detail_equals":
        return _constraint_decision_detail_equals(
            assertion=assertion,
            point=event_point,
        )
    if assertion_type == "ratio_zone_equals":
        return _constraint_ratio_zone_equals(assertion=assertion, point=event_point)
    return _constraint_failure(
        event_point,
        f"Unsupported assertion type: {assertion_type!r}",
    )


def _constraint_asset_compare(
    *,
    assertion: dict[str, Any],
    point: dict[str, Any],
    comparator: str,
) -> str | None:
    asset = _constraint_asset(assertion)
    actual = _constraint_target_asset(point, asset=asset)
    expected = float(assertion.get("value", 0.0))
    if comparator == "equals" and abs(actual - expected) > CONSTRAINT_EPSILON:
        return _constraint_failure(
            point,
            f"target {asset}={actual:.6f}; expected {expected:.6f}",
        )
    if comparator == "greater_than" and actual <= expected + CONSTRAINT_EPSILON:
        return _constraint_failure(
            point,
            f"target {asset}={actual:.6f}; expected > {expected:.6f}",
        )
    if comparator == "greater_than_or_equal" and actual < expected - CONSTRAINT_EPSILON:
        return _constraint_failure(
            point,
            f"target {asset}={actual:.6f}; expected >= {expected:.6f}",
        )
    return None


def _constraint_asset_vs_previous(
    *,
    assertion: dict[str, Any],
    point: dict[str, Any],
    previous_point: dict[str, Any] | None,
    comparator: str,
) -> str | None:
    if previous_point is None:
        return _constraint_failure(
            point,
            "No previous point available for previous-allocation assertion",
        )
    asset = _constraint_asset(assertion)
    actual = _constraint_target_asset(point, asset=asset)
    previous = _constraint_portfolio_asset(previous_point, asset=asset)
    return _constraint_compare_current_to_previous(
        point=point,
        label=f"target {asset}",
        actual=actual,
        previous=previous,
        comparator=comparator,
        tolerance=_constraint_tolerance(assertion),
    )


def _constraint_asset_vs_current(
    *,
    assertion: dict[str, Any],
    point: dict[str, Any],
    comparator: str,
) -> str | None:
    asset = _constraint_asset(assertion)
    actual = _constraint_target_asset(point, asset=asset)
    current = _constraint_portfolio_asset(point, asset=asset)
    return _constraint_compare_current_to_previous(
        point=point,
        label=f"target {asset}",
        actual=actual,
        previous=current,
        comparator=comparator,
        previous_label="current",
        tolerance=_constraint_tolerance(assertion),
    )


def _constraint_if_current_crypto_gt_asset_compare(
    *,
    assertion: dict[str, Any],
    point: dict[str, Any],
    comparator: str,
) -> str | None:
    current_crypto = _constraint_portfolio_crypto(point)
    threshold = float(assertion.get("current_crypto_threshold", CONSTRAINT_EPSILON))
    if current_crypto <= threshold:
        return None
    return _constraint_asset_compare(
        assertion=assertion,
        point=point,
        comparator=comparator,
    )


def _constraint_crypto_vs_previous(
    *,
    point: dict[str, Any],
    previous_point: dict[str, Any] | None,
    comparator: str,
) -> str | None:
    if previous_point is None:
        return _constraint_failure(
            point,
            "No previous point available for crypto assertion",
        )
    actual = _constraint_target_crypto(point)
    previous = _constraint_portfolio_crypto(previous_point)
    return _constraint_compare_current_to_previous(
        point=point,
        label="target crypto",
        actual=actual,
        previous=previous,
        comparator=comparator,
    )


def _constraint_eventual_asset_vs_previous(
    *,
    assertion: dict[str, Any],
    points: list[dict[str, Any]],
    event_point: dict[str, Any],
    comparator: str,
) -> str | None:
    asset = _constraint_asset(assertion)
    within_days = int(assertion.get("within_days", 0))
    event_date = _parse_date(str(event_point["date"]))
    end_date = event_date + timedelta(days=max(0, within_days))
    inspected: list[str] = []
    for point in points:
        point_date = _parse_date(str(point["date"]))
        if point_date < event_date or point_date > end_date:
            continue
        previous_point = _previous_constraint_point(points=points, event_point=point)
        if previous_point is None:
            continue
        inspected.append(str(point["date"]))
        actual = _constraint_target_asset(point, asset=asset)
        previous = _constraint_portfolio_asset(previous_point, asset=asset)
        if _constraint_comparison_passes(
            actual=actual,
            previous=previous,
            comparator=comparator,
        ):
            return None
    return _constraint_failure(
        event_point,
        f"No point within {within_days} days satisfied {asset} {comparator} previous; "
        f"inspected dates: {', '.join(inspected) or 'none'}",
    )


def _constraint_decision_action_in(
    *,
    assertion: dict[str, Any],
    point: dict[str, Any],
) -> str | None:
    expected = assertion.get("values")
    if not isinstance(expected, list):
        return _constraint_failure(
            point,
            "decision_action_in assertion must define values array",
        )
    action = _constraint_decision(point).get("action")
    if action not in expected:
        return _constraint_failure(
            point,
            f"decision action={action!r}; expected one of {expected!r}",
        )
    return None


def _constraint_decision_action_equals(
    *,
    assertion: dict[str, Any],
    point: dict[str, Any],
) -> str | None:
    expected = assertion.get("value")
    action = _constraint_decision(point).get("action")
    if action != expected:
        return _constraint_failure(
            point,
            f"decision action={action!r}; expected {expected!r}",
        )
    return None


def _constraint_matched_rule_name_not_equals(
    *,
    assertion: dict[str, Any],
    point: dict[str, Any],
) -> str | None:
    expected_absent = assertion.get("value")
    details = _safe_mapping(_constraint_decision(point).get("details"))
    actual = details.get("matched_rule_name")
    if actual == expected_absent:
        return _constraint_failure(
            point,
            f"matched_rule_name={actual!r}; expected value other than {expected_absent!r}",
        )
    return None


def _constraint_decision_reason_in(
    *,
    assertion: dict[str, Any],
    point: dict[str, Any],
) -> str | None:
    expected = assertion.get("values") or assertion.get("reasons")
    if not isinstance(expected, list):
        return _constraint_failure(
            point,
            "decision_reason_in assertion must define values array",
        )
    reason = _constraint_decision(point).get("reason")
    if reason not in expected:
        return _constraint_failure(
            point,
            f"decision reason={reason!r}; expected one of {expected!r}",
        )
    return None


def _constraint_decision_detail_equals(
    *,
    assertion: dict[str, Any],
    point: dict[str, Any],
) -> str | None:
    key = assertion.get("key")
    if not isinstance(key, str) or not key:
        return _constraint_failure(
            point,
            "decision_detail_equals assertion must define key",
        )
    expected = assertion.get("value")
    details = _safe_mapping(_constraint_decision(point).get("details"))
    actual = details.get(key)
    if actual != expected:
        return _constraint_failure(
            point,
            f"decision detail {key}={actual!r}; expected {expected!r}",
        )
    return None


def _constraint_ratio_zone_equals(
    *,
    assertion: dict[str, Any],
    point: dict[str, Any],
) -> str | None:
    expected = assertion.get("zone")
    if not isinstance(expected, str) or not expected:
        return _constraint_failure(
            point,
            "ratio_zone_equals assertion must define zone",
        )
    actual = _constraint_inner_ratio_zone(point)
    if actual != expected:
        return _constraint_failure(
            point,
            f"ratio zone={actual!r}; expected {expected!r}",
        )
    return None


def _constraint_compare_current_to_previous(
    *,
    point: dict[str, Any],
    label: str,
    actual: float,
    previous: float,
    comparator: str,
    previous_label: str = "previous",
    tolerance: float = CONSTRAINT_EPSILON,
) -> str | None:
    if _constraint_comparison_passes(
        actual=actual,
        previous=previous,
        comparator=comparator,
        tolerance=tolerance,
    ):
        return None
    symbol = {
        "greater_than": ">",
        "less_than": "<",
        "not_greater_than": "<=",
    }.get(comparator, comparator)
    return _constraint_failure(
        point,
        f"{label}={actual:.6f}; expected {symbol} {previous_label} {previous:.6f}",
    )


def _constraint_comparison_passes(
    *,
    actual: float,
    previous: float,
    comparator: str,
    tolerance: float = CONSTRAINT_EPSILON,
) -> bool:
    if comparator == "greater_than":
        return actual > previous + tolerance
    if comparator == "less_than":
        return actual < previous - tolerance
    if comparator == "not_greater_than":
        return actual <= previous + tolerance
    raise ValidationEventError(f"Unsupported constraint comparator: {comparator}")


def _constraint_asset(assertion: dict[str, Any]) -> str:
    asset = str(assertion.get("asset", "")).lower()
    if asset not in ASSET_KEYS:
        raise ValidationEventError(f"Unsupported asset in assertion: {asset!r}")
    return asset


def _constraint_tolerance(assertion: dict[str, Any]) -> float:
    raw = assertion.get("tolerance")
    if isinstance(raw, int | float) and not isinstance(raw, bool):
        return float(raw)
    return CONSTRAINT_EPSILON


def _constraint_target_asset(point: dict[str, Any], *, asset: str) -> float:
    target = _constraint_decision(point).get("target_allocation")
    if not isinstance(target, dict):
        return 0.0
    return _constraint_number(target.get(asset))


def _constraint_portfolio_asset(point: dict[str, Any], *, asset: str) -> float:
    portfolio = _safe_mapping(point.get("portfolio"))
    allocation = portfolio.get("asset_allocation")
    if not isinstance(allocation, dict):
        return 0.0
    return _constraint_number(allocation.get(asset))


def _constraint_target_crypto(point: dict[str, Any]) -> float:
    return _constraint_target_asset(point, asset="btc") + _constraint_target_asset(
        point,
        asset="eth",
    )


def _constraint_portfolio_crypto(point: dict[str, Any]) -> float:
    return _constraint_portfolio_asset(
        point, asset="btc"
    ) + _constraint_portfolio_asset(
        point,
        asset="eth",
    )


def _constraint_decision(point: dict[str, Any]) -> dict[str, Any]:
    return _safe_mapping(point.get("decision"))


def _constraint_signal(point: dict[str, Any]) -> dict[str, Any]:
    signal = point.get("signal")
    return signal if isinstance(signal, dict) else {}


def _constraint_dma(point: dict[str, Any], *, key: str) -> dict[str, Any]:
    signal = _constraint_signal(point)
    direct = signal.get(key)
    if isinstance(direct, dict):
        return direct
    details = _safe_mapping(signal.get("details"))
    detail_value = details.get(key)
    return detail_value if isinstance(detail_value, dict) else {}


def _constraint_inner_ratio_zone(point: dict[str, Any]) -> str | None:
    details = _safe_mapping(_constraint_decision(point).get("details"))
    zone = details.get("inner_ratio_zone")
    if isinstance(zone, str):
        return zone
    ratio = _constraint_dma(point, key="ratio")
    signal_zone = ratio.get("zone")
    return signal_zone if isinstance(signal_zone, str) else None


def _constraint_sentiment_label(point: dict[str, Any]) -> str | None:
    market = _safe_mapping(point.get("market"))
    label = market.get("sentiment_label")
    if label is not None:
        return _normalize_constraint_label(label)
    signal = _constraint_signal(point)
    regime = signal.get("regime")
    return _normalize_constraint_label(regime) if regime is not None else None


def _constraint_macro_sentiment_label(point: dict[str, Any]) -> str | None:
    market = _safe_mapping(point.get("market"))
    macro = _safe_mapping(market.get("macro_fear_greed"))
    label = macro.get("label")
    if label is not None:
        return _normalize_constraint_label(label)
    raw_rating = macro.get("raw_rating")
    if raw_rating is not None:
        return _normalize_constraint_label(raw_rating)
    return None


def _normalize_constraint_label(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower().replace("-", "_").replace(" ", "_")
    return normalized or None


def _point_for_date(
    *,
    points: list[dict[str, Any]],
    event_date: str,
) -> dict[str, Any] | None:
    for point in points:
        if point["date"] == event_date:
            return point
    return None


def _previous_constraint_point(
    *,
    points: list[dict[str, Any]],
    event_point: dict[str, Any],
) -> dict[str, Any] | None:
    event_date = _parse_date(str(event_point["date"]))
    previous_points = [
        point for point in points if _parse_date(str(point["date"])) < event_date
    ]
    if not previous_points:
        return None
    return max(previous_points, key=lambda point: _parse_date(str(point["date"])))


def _constraint_failure(point: dict[str, Any], message: str) -> str:
    return f"{point['date']}: {message}"


def _constraint_number(value: Any) -> float:
    return (
        float(value)
        if isinstance(value, int | float) and not isinstance(value, bool)
        else 0.0
    )


def _optional_upper(value: Any) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    return value.upper()


def _safe_mapping(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _parse_date(raw: str) -> date:
    try:
        return date.fromisoformat(raw)
    except ValueError as exc:
        raise ValidationEventError(f"Invalid date value: {raw!r}") from exc


__all__ = [
    "AssertionResult",
    "ConstraintValidationFailed",
    "EventResult",
    "ValidationEvent",
    "ValidationEventError",
    "assert_target_asset_decreased_from_previous",
    "assert_target_asset_equals",
    "assert_target_asset_increased_from_previous",
    "build_constraint_validation",
    "evaluate_event",
    "load_validation_events",
]
