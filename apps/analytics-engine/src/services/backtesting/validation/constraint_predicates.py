"""Constraint assertion predicates for backtesting event validation.

This module contains:
- Low-level accessor helpers (``_constraint_*``, ``_safe_mapping``, etc.)
- Numeric comparison logic (``_constraint_comparison_passes``, ``_constraint_compare_current_to_previous``)
- Per-assertion-type predicate functions (``_constraint_asset_compare``, etc.)
- The top-level dispatch ``evaluate_constraint_assertion``

All functions are pure — no I/O, no side-effects.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import date, timedelta
from typing import Any

ASSET_KEYS = frozenset({"btc", "eth", "spy", "stable", "alt"})
CONSTRAINT_EPSILON = 1e-6


class ValidationEventError(ValueError):
    """Raised when a validation fixture or assertion is malformed."""


# ---------------------------------------------------------------------------
# Low-level helpers
# ---------------------------------------------------------------------------


def constraint_failure(point: dict[str, Any], message: str) -> str:
    return f"{point['date']}: {message}"


def constraint_number(value: Any) -> float:
    return (
        float(value)
        if isinstance(value, int | float) and not isinstance(value, bool)
        else 0.0
    )


def optional_upper(value: Any) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    return value.upper()


def safe_mapping(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def parse_date(raw: str) -> date:
    try:
        return date.fromisoformat(raw)
    except ValueError as exc:
        raise ValidationEventError(f"Invalid date value: {raw!r}") from exc


def normalize_constraint_label(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower().replace("-", "_").replace(" ", "_")
    return normalized or None


# ---------------------------------------------------------------------------
# Point accessors
# ---------------------------------------------------------------------------


def constraint_decision(point: dict[str, Any]) -> dict[str, Any]:
    return safe_mapping(point.get("decision"))


def constraint_signal(point: dict[str, Any]) -> dict[str, Any]:
    return safe_mapping(point.get("signal"))


def constraint_dma(point: dict[str, Any], *, key: str) -> dict[str, Any]:
    signal = constraint_signal(point)
    direct = signal.get(key)
    if isinstance(direct, dict):
        return direct
    details = safe_mapping(signal.get("details"))
    return safe_mapping(details.get(key))


def constraint_inner_ratio_zone(point: dict[str, Any]) -> str | None:
    details = safe_mapping(constraint_decision(point).get("details"))
    zone = details.get("inner_ratio_zone")
    if isinstance(zone, str):
        return zone
    ratio = constraint_dma(point, key="ratio")
    signal_zone = ratio.get("zone")
    return signal_zone if isinstance(signal_zone, str) else None


def constraint_sentiment_label(point: dict[str, Any]) -> str | None:
    market = safe_mapping(point.get("market"))
    label = market.get("sentiment_label")
    if label is not None:
        return normalize_constraint_label(label)
    signal = constraint_signal(point)
    regime = signal.get("regime")
    return normalize_constraint_label(regime) if regime is not None else None


def constraint_macro_sentiment_label(point: dict[str, Any]) -> str | None:
    market = safe_mapping(point.get("market"))
    macro = safe_mapping(market.get("macro_fear_greed"))
    label = macro.get("label")
    if label is not None:
        return normalize_constraint_label(label)
    raw_rating = macro.get("raw_rating")
    if raw_rating is not None:
        return normalize_constraint_label(raw_rating)
    return None


def constraint_asset(assertion: dict[str, Any]) -> str:
    asset = str(assertion.get("asset", "")).lower()
    if asset not in ASSET_KEYS:
        raise ValidationEventError(f"Unsupported asset in assertion: {asset!r}")
    return asset


def constraint_tolerance(assertion: dict[str, Any]) -> float:
    raw = assertion.get("tolerance")
    if isinstance(raw, int | float) and not isinstance(raw, bool):
        return float(raw)
    return CONSTRAINT_EPSILON


def constraint_target_asset(point: dict[str, Any], *, asset: str) -> float:
    target = constraint_decision(point).get("target_allocation")
    if not isinstance(target, dict):
        return 0.0
    return constraint_number(target.get(asset))


def constraint_portfolio_asset(point: dict[str, Any], *, asset: str) -> float:
    portfolio = safe_mapping(point.get("portfolio"))
    allocation = portfolio.get("asset_allocation")
    if not isinstance(allocation, dict):
        return 0.0
    return constraint_number(allocation.get(asset))


def constraint_target_crypto(point: dict[str, Any]) -> float:
    return constraint_target_asset(point, asset="btc") + constraint_target_asset(
        point, asset="eth"
    )


def constraint_portfolio_crypto(point: dict[str, Any]) -> float:
    return constraint_portfolio_asset(point, asset="btc") + constraint_portfolio_asset(
        point, asset="eth"
    )


# ---------------------------------------------------------------------------
# Timeline helpers (used by predicates and caller)
# ---------------------------------------------------------------------------


def point_for_date(
    *,
    points: list[dict[str, Any]],
    event_date: str,
) -> dict[str, Any] | None:
    for point in points:
        if point["date"] == event_date:
            return point
    return None


def previous_constraint_point(
    *,
    points: list[dict[str, Any]],
    event_point: dict[str, Any],
) -> dict[str, Any] | None:
    event_date = parse_date(str(event_point["date"]))
    previous_points = [
        point for point in points if parse_date(str(point["date"])) < event_date
    ]
    if not previous_points:
        return None
    return max(previous_points, key=lambda point: parse_date(str(point["date"])))


# ---------------------------------------------------------------------------
# Comparison engine
# ---------------------------------------------------------------------------


_COMPARATORS: dict[str, Callable[[float, float, float], bool]] = {
    "equals": lambda actual, previous, tolerance: abs(actual - previous) <= tolerance,
    "greater_than": lambda actual, previous, tolerance: actual > previous + tolerance,
    "less_than": lambda actual, previous, tolerance: actual < previous - tolerance,
    "not_greater_than": lambda actual, previous, tolerance: actual
    <= previous + tolerance,
    "not_less_than": lambda actual, previous, tolerance: actual >= previous - tolerance,
}


def constraint_comparison_passes(
    *,
    actual: float,
    previous: float,
    comparator: str,
    tolerance: float = CONSTRAINT_EPSILON,
) -> bool:
    predicate = _COMPARATORS.get(comparator)
    if predicate is None:
        raise ValidationEventError(f"Unsupported constraint comparator: {comparator}")
    return predicate(actual, previous, tolerance)


def constraint_compare_current_to_previous(
    *,
    point: dict[str, Any],
    label: str,
    actual: float,
    previous: float,
    comparator: str,
    previous_label: str = "previous",
    tolerance: float = CONSTRAINT_EPSILON,
) -> str | None:
    if constraint_comparison_passes(
        actual=actual,
        previous=previous,
        comparator=comparator,
        tolerance=tolerance,
    ):
        return None
    symbol = {
        "equals": "==",
        "greater_than": ">",
        "less_than": "<",
        "not_greater_than": "<=",
        "not_less_than": ">=",
    }.get(comparator, comparator)
    return constraint_failure(
        point,
        f"{label}={actual:.6f}; expected {symbol} {previous_label} {previous:.6f}",
    )


# ---------------------------------------------------------------------------
# Per-assertion-type predicate functions
# ---------------------------------------------------------------------------


def predicate_asset_compare(
    *,
    assertion: dict[str, Any],
    point: dict[str, Any],
    comparator: str,
) -> str | None:
    """Assert target allocation for one asset against a fixed value."""
    asset = constraint_asset(assertion)
    actual = constraint_target_asset(point, asset=asset)
    expected = float(assertion.get("value", 0.0))
    if comparator == "equals" and abs(actual - expected) > CONSTRAINT_EPSILON:
        return constraint_failure(
            point,
            f"target {asset}={actual:.6f}; expected {expected:.6f}",
        )
    if comparator == "greater_than" and actual <= expected + CONSTRAINT_EPSILON:
        return constraint_failure(
            point,
            f"target {asset}={actual:.6f}; expected > {expected:.6f}",
        )
    if comparator == "greater_than_or_equal" and actual < expected - CONSTRAINT_EPSILON:
        return constraint_failure(
            point,
            f"target {asset}={actual:.6f}; expected >= {expected:.6f}",
        )
    return None


def predicate_asset_vs_previous(
    *,
    assertion: dict[str, Any],
    point: dict[str, Any],
    previous_point: dict[str, Any] | None,
    comparator: str,
) -> str | None:
    """Assert target allocation for one asset vs its portfolio allocation in the previous point."""
    if previous_point is None:
        return constraint_failure(
            point,
            "No previous point available for previous-allocation assertion",
        )
    asset = constraint_asset(assertion)
    actual = constraint_target_asset(point, asset=asset)
    previous = constraint_portfolio_asset(previous_point, asset=asset)
    return constraint_compare_current_to_previous(
        point=point,
        label=f"target {asset}",
        actual=actual,
        previous=previous,
        comparator=comparator,
        tolerance=constraint_tolerance(assertion),
    )


def predicate_asset_vs_current(
    *,
    assertion: dict[str, Any],
    point: dict[str, Any],
    comparator: str,
) -> str | None:
    """Assert target allocation for one asset vs its *current* portfolio allocation."""
    asset = constraint_asset(assertion)
    actual = constraint_target_asset(point, asset=asset)
    current = constraint_portfolio_asset(point, asset=asset)
    return constraint_compare_current_to_previous(
        point=point,
        label=f"target {asset}",
        actual=actual,
        previous=current,
        comparator=comparator,
        previous_label="current",
        tolerance=constraint_tolerance(assertion),
    )


def predicate_if_current_crypto_gt_asset_compare(
    *,
    assertion: dict[str, Any],
    point: dict[str, Any],
    comparator: str,
) -> str | None:
    """Conditional: only assert if current portfolio crypto > threshold."""
    current_crypto = constraint_portfolio_crypto(point)
    threshold = float(assertion.get("current_crypto_threshold", CONSTRAINT_EPSILON))
    if current_crypto <= threshold:
        return None
    return predicate_asset_compare(
        assertion=assertion,
        point=point,
        comparator=comparator,
    )


def predicate_crypto_vs_previous(
    *,
    point: dict[str, Any],
    previous_point: dict[str, Any] | None,
    comparator: str,
) -> str | None:
    """Assert combined target crypto (btc+eth) vs previous combined portfolio crypto."""
    if previous_point is None:
        return constraint_failure(
            point,
            "No previous point available for crypto assertion",
        )
    actual = constraint_target_crypto(point)
    previous = constraint_portfolio_crypto(previous_point)
    return constraint_compare_current_to_previous(
        point=point,
        label="target crypto",
        actual=actual,
        previous=previous,
        comparator=comparator,
    )


def predicate_eventual_asset_vs_previous(
    *,
    assertion: dict[str, Any],
    points: list[dict[str, Any]],
    event_point: dict[str, Any],
    comparator: str,
) -> str | None:
    """Assert that within `within_days` some point satisfies asset comparator vs its previous."""
    asset = constraint_asset(assertion)
    within_days = int(assertion.get("within_days", 0))
    event_date = parse_date(str(event_point["date"]))
    end_date = event_date + timedelta(days=max(0, within_days))
    inspected: list[str] = []
    for point in points:
        point_date = parse_date(str(point["date"]))
        if point_date < event_date or point_date > end_date:
            continue
        prev = previous_constraint_point(points=points, event_point=point)
        if prev is None:
            continue
        inspected.append(str(point["date"]))
        actual = constraint_target_asset(point, asset=asset)
        previous = constraint_portfolio_asset(prev, asset=asset)
        if constraint_comparison_passes(
            actual=actual,
            previous=previous,
            comparator=comparator,
        ):
            return None
    return constraint_failure(
        event_point,
        f"No point within {within_days} days satisfied {asset} {comparator} previous; "
        f"inspected dates: {', '.join(inspected) or 'none'}",
    )


def predicate_decision_action_in(
    *,
    assertion: dict[str, Any],
    point: dict[str, Any],
) -> str | None:
    expected = assertion.get("values")
    if not isinstance(expected, list):
        return constraint_failure(
            point,
            "decision_action_in assertion must define values array",
        )
    action = constraint_decision(point).get("action")
    if action not in expected:
        return constraint_failure(
            point,
            f"decision action={action!r}; expected one of {expected!r}",
        )
    return None


def predicate_decision_action_equals(
    *,
    assertion: dict[str, Any],
    point: dict[str, Any],
) -> str | None:
    expected = assertion.get("value")
    action = constraint_decision(point).get("action")
    if action != expected:
        return constraint_failure(
            point,
            f"decision action={action!r}; expected {expected!r}",
        )
    return None


def predicate_matched_rule_name_not_equals(
    *,
    assertion: dict[str, Any],
    point: dict[str, Any],
) -> str | None:
    expected_absent = assertion.get("value")
    details = safe_mapping(constraint_decision(point).get("details"))
    actual = details.get("matched_rule_name")
    if actual == expected_absent:
        return constraint_failure(
            point,
            f"matched_rule_name={actual!r}; expected value other than {expected_absent!r}",
        )
    return None


def predicate_decision_reason_in(
    *,
    assertion: dict[str, Any],
    point: dict[str, Any],
) -> str | None:
    expected = assertion.get("values") or assertion.get("reasons")
    if not isinstance(expected, list):
        return constraint_failure(
            point,
            "decision_reason_in assertion must define values array",
        )
    reason = constraint_decision(point).get("reason")
    if reason not in expected:
        return constraint_failure(
            point,
            f"decision reason={reason!r}; expected one of {expected!r}",
        )
    return None


def predicate_decision_detail_equals(
    *,
    assertion: dict[str, Any],
    point: dict[str, Any],
) -> str | None:
    key = assertion.get("key")
    if not isinstance(key, str) or not key:
        return constraint_failure(
            point,
            "decision_detail_equals assertion must define key",
        )
    expected = assertion.get("value")
    details = safe_mapping(constraint_decision(point).get("details"))
    actual = details.get(key)
    if actual != expected:
        return constraint_failure(
            point,
            f"decision detail {key}={actual!r}; expected {expected!r}",
        )
    return None


def predicate_ratio_zone_equals(
    *,
    assertion: dict[str, Any],
    point: dict[str, Any],
) -> str | None:
    expected = assertion.get("zone")
    if not isinstance(expected, str) or not expected:
        return constraint_failure(
            point,
            "ratio_zone_equals assertion must define zone",
        )
    actual = constraint_inner_ratio_zone(point)
    if actual != expected:
        return constraint_failure(
            point,
            f"ratio zone={actual!r}; expected {expected!r}",
        )
    return None


# ---------------------------------------------------------------------------
# Top-level assertion dispatcher
# ---------------------------------------------------------------------------


def evaluate_constraint_assertion(
    *,
    assertion: dict[str, Any],
    points: list[dict[str, Any]],
    event_point: dict[str, Any],
) -> str | None:
    """Dispatch an assertion dict to the appropriate predicate and return a failure
    message string, or ``None`` if the assertion passes.

    Returns:
        ``None`` on pass, or a human-readable failure string on fail.
    """
    assertion_type = assertion.get("type")
    previous_point = previous_constraint_point(points=points, event_point=event_point)

    if assertion_type == "target_asset_equals":
        return predicate_asset_compare(
            assertion=assertion,
            point=event_point,
            comparator="equals",
        )
    if assertion_type in {"target_asset_greater_than", "target_asset_gt"}:
        return predicate_asset_compare(
            assertion=assertion,
            point=event_point,
            comparator="greater_than",
        )
    if assertion_type == "target_asset_gte":
        return predicate_asset_compare(
            assertion=assertion,
            point=event_point,
            comparator="greater_than_or_equal",
        )
    if assertion_type in {
        "target_asset_greater_than_previous",
        "target_asset_increased_from_previous",
    }:
        return predicate_asset_vs_previous(
            assertion=assertion,
            point=event_point,
            previous_point=previous_point,
            comparator="greater_than",
        )
    if assertion_type in {
        "target_asset_less_than_previous",
        "target_asset_decreased_from_previous",
    }:
        return predicate_asset_vs_previous(
            assertion=assertion,
            point=event_point,
            previous_point=previous_point,
            comparator="less_than",
        )
    if assertion_type in {
        "target_asset_not_greater_than_previous",
        "target_asset_not_increased_from_previous",
    }:
        return predicate_asset_vs_previous(
            assertion=assertion,
            point=event_point,
            previous_point=previous_point,
            comparator="not_greater_than",
        )
    if assertion_type in {
        "target_asset_not_greater_than_current",
        "target_asset_not_increased_from_current",
    }:
        return predicate_asset_vs_current(
            assertion=assertion,
            point=event_point,
            comparator="not_greater_than",
        )
    if assertion_type == "target_asset_unchanged_from_current":
        return predicate_asset_vs_current(
            assertion=assertion,
            point=event_point,
            comparator="equals",
        )
    if assertion_type in {
        "target_asset_not_decreased_from_current",
        "target_asset_not_less_than_current",
    }:
        return predicate_asset_vs_current(
            assertion=assertion,
            point=event_point,
            comparator="not_less_than",
        )
    if assertion_type in {
        "target_crypto_greater_than_previous",
        "target_crypto_increased_from_previous",
    }:
        return predicate_crypto_vs_previous(
            point=event_point,
            previous_point=previous_point,
            comparator="greater_than",
        )
    if assertion_type == "target_stable_decreased_from_previous":
        return predicate_asset_vs_previous(
            assertion={"asset": "stable"},
            point=event_point,
            previous_point=previous_point,
            comparator="less_than",
        )
    if assertion_type == "target_stable_increased_from_previous":
        return predicate_asset_vs_previous(
            assertion={"asset": "stable"},
            point=event_point,
            previous_point=previous_point,
            comparator="greater_than",
        )
    if assertion_type == "target_spy_not_increased_from_previous":
        return predicate_asset_vs_previous(
            assertion={**assertion, "asset": "spy"},
            point=event_point,
            previous_point=previous_point,
            comparator="not_greater_than",
        )
    if assertion_type == "target_spy_not_greater_than_current":
        return predicate_asset_vs_current(
            assertion={**assertion, "asset": "spy"},
            point=event_point,
            comparator="not_greater_than",
        )
    if assertion_type == "if_current_crypto_gt_target_asset_equals":
        return predicate_if_current_crypto_gt_asset_compare(
            assertion=assertion,
            point=event_point,
            comparator="equals",
        )
    if assertion_type == "if_current_crypto_gt_target_asset_gt":
        return predicate_if_current_crypto_gt_asset_compare(
            assertion=assertion,
            point=event_point,
            comparator="greater_than",
        )
    if assertion_type == "eventually_target_asset_greater_than_previous":
        return predicate_eventual_asset_vs_previous(
            assertion=assertion,
            points=points,
            event_point=event_point,
            comparator="greater_than",
        )
    if assertion_type == "eventually_target_asset_less_than_previous":
        return predicate_eventual_asset_vs_previous(
            assertion=assertion,
            points=points,
            event_point=event_point,
            comparator="less_than",
        )
    if assertion_type == "decision_action_in":
        return predicate_decision_action_in(assertion=assertion, point=event_point)
    if assertion_type == "decision_action_equals":
        return predicate_decision_action_equals(assertion=assertion, point=event_point)
    if assertion_type == "matched_rule_name_not_equals":
        return predicate_matched_rule_name_not_equals(
            assertion=assertion, point=event_point
        )
    if assertion_type == "decision_reason_in":
        return predicate_decision_reason_in(assertion=assertion, point=event_point)
    if assertion_type == "decision_detail_equals":
        return predicate_decision_detail_equals(assertion=assertion, point=event_point)
    if assertion_type == "ratio_zone_equals":
        return predicate_ratio_zone_equals(assertion=assertion, point=event_point)
    return constraint_failure(
        event_point,
        f"Unsupported assertion type: {assertion_type!r}",
    )


__all__ = [
    "ASSET_KEYS",
    "CONSTRAINT_EPSILON",
    "ValidationEventError",
    # Helpers
    "constraint_failure",
    "constraint_number",
    "optional_upper",
    "safe_mapping",
    "parse_date",
    "normalize_constraint_label",
    # Accessors
    "constraint_decision",
    "constraint_signal",
    "constraint_dma",
    "constraint_inner_ratio_zone",
    "constraint_sentiment_label",
    "constraint_macro_sentiment_label",
    "constraint_asset",
    "constraint_tolerance",
    "constraint_target_asset",
    "constraint_portfolio_asset",
    "constraint_target_crypto",
    "constraint_portfolio_crypto",
    # Timeline helpers
    "point_for_date",
    "previous_constraint_point",
    # Comparison engine
    "constraint_comparison_passes",
    "constraint_compare_current_to_previous",
    # Predicates
    "predicate_asset_compare",
    "predicate_asset_vs_previous",
    "predicate_asset_vs_current",
    "predicate_if_current_crypto_gt_asset_compare",
    "predicate_crypto_vs_previous",
    "predicate_eventual_asset_vs_previous",
    "predicate_decision_action_in",
    "predicate_decision_action_equals",
    "predicate_matched_rule_name_not_equals",
    "predicate_decision_reason_in",
    "predicate_decision_detail_equals",
    "predicate_ratio_zone_equals",
    # Dispatcher
    "evaluate_constraint_assertion",
]
