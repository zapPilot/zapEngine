"""Fixture-backed event validation for backtesting timelines.

Sections in this file (use these as a folding map):
- Exceptions: ``ValidationEventError``, ``ConstraintValidationFailed``
- Data classes: ``ValidationEvent``, ``AssertionResult``, ``EventResult``
- Public API: ``load_validation_events``, ``evaluate_event``,
  ``build_constraint_validation``
- Assertion predicates: ``assert_target_asset_equals`` /
  ``assert_target_asset_increased_from_previous`` /
  ``assert_target_asset_decreased_from_previous``
- Constraint case evaluator: ``_validate_constraint_case``
- Trigger-failure detectors: ``_constraint_event_trigger_failure``,
  ``_crypto_cross_trigger_failure``, ``_dma_cross_trigger_failure``,
  ``_inner_ratio_cross_trigger_failure``
- Window helpers: ``_constraint_max_within_days``,
  ``_window_contains_extreme_fear_below_dma``
- Precondition skip logic: ``_maybe_precondition_skip``

All assertion predicate dispatch and helper logic lives in
``constraint_predicates`` (same package).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from typing import Any

from src.services.backtesting.validation.constraint_predicates import (
    ASSET_KEYS as ASSET_KEYS,
)
from src.services.backtesting.validation.constraint_predicates import (
    CONSTRAINT_EPSILON as CONSTRAINT_EPSILON,
)
from src.services.backtesting.validation.constraint_predicates import (
    ValidationEventError,
    constraint_decision,
    constraint_dma,
    constraint_inner_ratio_zone,
    constraint_macro_sentiment_label,
    constraint_number,
    constraint_sentiment_label,
    evaluate_constraint_assertion,
    normalize_constraint_label,
    optional_upper,
    parse_date,
    point_for_date,
    previous_constraint_point,
    safe_mapping,
)


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
    from src.services.backtesting.validation.constraint_predicates import (
        predicate_asset_compare,
    )

    return predicate_asset_compare(
        assertion=assertion,
        point=event_point,
        comparator="equals",
    )


def assert_target_asset_increased_from_previous(
    assertion: dict[str, Any],
    points: list[dict[str, Any]],
    event_point: dict[str, Any],
) -> str | None:
    from src.services.backtesting.validation.constraint_predicates import (
        predicate_asset_vs_previous,
    )

    return predicate_asset_vs_previous(
        assertion=assertion,
        point=event_point,
        previous_point=previous_constraint_point(
            points=points, event_point=event_point
        ),
        comparator="greater_than",
    )


def assert_target_asset_decreased_from_previous(
    assertion: dict[str, Any],
    points: list[dict[str, Any]],
    event_point: dict[str, Any],
) -> str | None:
    from src.services.backtesting.validation.constraint_predicates import (
        predicate_asset_vs_previous,
    )

    return predicate_asset_vs_previous(
        assertion=assertion,
        point=event_point,
        previous_point=previous_constraint_point(
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
    event_point = point_for_date(points=points, event_date=event_date)
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
        failure = evaluate_constraint_assertion(
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

    reference = optional_upper(event.get("reference_asset"))
    if reference is None and event_type == "spy_cross_down":
        reference = "SPY"
    if reference is None:
        return None

    previous = previous_constraint_point(points=points, event_point=point)
    if previous is None:
        return None

    target = safe_mapping(constraint_decision(previous).get("target_allocation"))
    reference_key = reference.lower()
    if reference_key not in target:
        return None
    prev_alloc = constraint_number(target.get(reference_key))
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
            reference_asset=optional_upper(case.get("reference_asset")),
        )
    if event_type == "crypto_cross_up":
        return _crypto_cross_trigger_failure(
            point=point,
            expected_cross="cross_up",
            reference_asset=optional_upper(case.get("reference_asset")),
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
        return _trigger_extreme_fear_below_crypto_dma(
            case=case, point=point, points=points
        )
    if event_type == "extreme_fear_below_spy_dma":
        return _trigger_extreme_fear_below_spy_dma(
            case=case, point=point, points=points
        )
    if event_type == "crypto_dma_fgi_sell":
        return _trigger_crypto_dma_fgi_sell(point=point)
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
    if event_type in {"decision_action_assertion", "hold"}:
        return None
    return _constraint_trigger_failure(
        point,
        f"Unsupported constraint event type: {event_type!r}",
    )


def _trigger_extreme_fear_below_crypto_dma(
    *,
    case: dict[str, Any],
    point: dict[str, Any],
    points: list[dict[str, Any]],
) -> str | None:
    within_days = _constraint_max_within_days(case)
    if _window_contains_extreme_fear_below_dma(
        points=points,
        event_point=point,
        within_days=within_days,
        dma_key="dma",
        include_crypto_sentiment=True,
        include_macro_sentiment=True,
    ):
        return None
    return _constraint_trigger_failure(
        point,
        f"no extreme_fear (crypto or macro) with DMA below within {within_days} days",
    )


def _trigger_extreme_fear_below_spy_dma(
    *,
    case: dict[str, Any],
    point: dict[str, Any],
    points: list[dict[str, Any]],
) -> str | None:
    within_days = _constraint_max_within_days(case)
    if _window_contains_extreme_fear_below_dma(
        points=points,
        event_point=point,
        within_days=within_days,
        dma_key="spy_dma",
        include_crypto_sentiment=False,
        include_macro_sentiment=True,
    ):
        return None
    return _constraint_trigger_failure(
        point,
        f"no macro extreme_fear with SPY DMA below within {within_days} days",
    )


def _trigger_crypto_dma_fgi_sell(*, point: dict[str, Any]) -> str | None:
    reason = constraint_decision(point).get("reason")
    if isinstance(reason, str) and "crypto_" in reason and "sell" in reason:
        return None
    return _constraint_trigger_failure(
        point,
        f"expected crypto DMA/FGI sell; observed reason={reason!r}",
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
    dma = constraint_dma(point, key="dma")
    observed_reference = optional_upper(
        dma.get("outer_dma_reference_asset") or dma.get("outer_dma_asset")
    )
    if observed_reference == reference_asset:
        return None
    return _constraint_trigger_failure(
        point,
        f"expected crypto DMA reference {reference_asset}; observed {observed_reference!r}",
    )


def _dma_cross_trigger_failure(
    *,
    point: dict[str, Any],
    dma_key: str,
    expected_cross: str,
) -> str | None:
    dma = constraint_dma(point, key=dma_key)
    observed = dma.get("cross_event")
    if observed == expected_cross:
        return None
    return _constraint_trigger_failure(
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
    previous_point = previous_constraint_point(points=points, event_point=point)
    if previous_point is None:
        return _constraint_trigger_failure(
            point,
            "No previous point available for ratio-cross event trigger",
        )
    previous = constraint_inner_ratio_zone(previous_point)
    observed = constraint_inner_ratio_zone(point)
    if previous == from_zone and observed == to_zone:
        return None
    return _constraint_trigger_failure(
        point,
        f"expected inner ratio zone transition {from_zone!r}->{to_zone!r}; "
        f"observed {previous!r}->{observed!r}",
    )


def _constraint_max_within_days(case: dict[str, Any]) -> int:
    within_days = 0
    for assertion in case.get("assertions", []):
        if not isinstance(assertion, dict):
            continue
        raw = assertion.get("within_days", 0)
        if isinstance(raw, bool):
            continue
        if isinstance(raw, int | float):
            within_days = max(within_days, int(raw))
    return max(0, within_days)


def _window_contains_extreme_fear_below_dma(
    *,
    points: list[dict[str, Any]],
    event_point: dict[str, Any],
    within_days: int,
    dma_key: str,
    include_crypto_sentiment: bool,
    include_macro_sentiment: bool,
) -> bool:
    event_date = parse_date(str(event_point["date"]))
    end_date = event_date + timedelta(days=within_days)
    for point in points:
        point_date = parse_date(str(point["date"]))
        if point_date < event_date or point_date > end_date:
            continue
        dma = constraint_dma(point, key=dma_key)
        if normalize_constraint_label(dma.get("zone")) != "below":
            continue
        crypto_extreme = constraint_sentiment_label(point) == "extreme_fear"
        macro_extreme = constraint_macro_sentiment_label(point) == "extreme_fear"
        if include_crypto_sentiment and crypto_extreme:
            return True
        if include_macro_sentiment and macro_extreme:
            return True
    return False


def _constraint_trigger_failure(point: dict[str, Any], message: str) -> str:
    return f"{point['date']}: {message}"


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
