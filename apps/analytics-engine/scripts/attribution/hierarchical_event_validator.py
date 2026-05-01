"""Fixture-driven validators for hierarchical SPY/crypto regression events."""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from src.services.backtesting.constants import STRATEGY_DMA_FGI_HIERARCHICAL_SPY_CRYPTO

ASSET_KEYS = frozenset({"btc", "eth", "spy", "stable", "alt"})
DEFAULT_STRATEGY_ID = STRATEGY_DMA_FGI_HIERARCHICAL_SPY_CRYPTO
DEFAULT_CONFIG_ID = STRATEGY_DMA_FGI_HIERARCHICAL_SPY_CRYPTO
EPSILON = 1e-6


@dataclass(frozen=True)
class EventValidationResult:
    case_id: str
    passed: bool
    event_date: str | None
    message: str
    inspected_dates: tuple[str, ...] = ()


def load_event_cases(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text())
    if not isinstance(payload, list):
        raise ValueError("Hierarchical validation fixture must be a JSON array")
    cases: list[dict[str, Any]] = []
    for index, raw_case in enumerate(payload):
        if not isinstance(raw_case, dict):
            raise ValueError(f"Fixture case at index {index} must be an object")
        _validate_case_shape(raw_case)
        cases.append(dict(raw_case))
    return cases


def _validate_case_shape(case: Mapping[str, Any]) -> None:
    for key in ("id", "event_type", "search_start_date", "search_end_date"):
        if not isinstance(case.get(key), str) or not case.get(key):
            raise ValueError(f"Fixture case must define non-empty string '{key}'")
    assertions = case.get("assertions")
    if not isinstance(assertions, list) or not assertions:
        raise ValueError(f"Fixture case {case['id']} must define assertions")


def build_compare_request(
    *,
    cases: Sequence[Mapping[str, Any]],
    strategy_id: str = DEFAULT_STRATEGY_ID,
    config_id: str = DEFAULT_CONFIG_ID,
    total_capital: float = 10_000.0,
) -> dict[str, Any]:
    if not cases:
        raise ValueError("At least one validation case is required")
    start_date = min(
        _parse_date(str(case.get("run_start_date") or case["search_start_date"]))
        for case in cases
    )
    end_date = max(_parse_date(str(case["search_end_date"])) for case in cases)
    return {
        "token_symbol": "BTC",
        "total_capital": total_capital,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "configs": [
            {
                "config_id": config_id,
                "strategy_id": strategy_id,
                "params": {},
            }
        ],
    }


def validate_cases(
    *,
    cases: Sequence[Mapping[str, Any]],
    payload: Mapping[str, Any],
    strategy_id: str = DEFAULT_CONFIG_ID,
) -> list[EventValidationResult]:
    timeline = _timeline(payload)
    return [
        validate_case(case=case, timeline=timeline, strategy_id=strategy_id)
        for case in cases
    ]


def validate_case(
    *,
    case: Mapping[str, Any],
    timeline: Sequence[Mapping[str, Any]],
    strategy_id: str = DEFAULT_CONFIG_ID,
) -> EventValidationResult:
    case_id = str(case["id"])
    window_points = _points_in_window(
        timeline=timeline,
        start_date=_parse_date(str(case["search_start_date"])),
        end_date=_parse_date(str(case["search_end_date"])),
    )
    event_point = _find_event_point(
        case=case,
        points=window_points,
        timeline=timeline,
        strategy_id=strategy_id,
    )
    if event_point is None:
        inspected_dates = tuple(_point_date(point) for point in window_points)
        return EventValidationResult(
            case_id=case_id,
            passed=False,
            event_date=None,
            message=(
                f"No matching {case['event_type']} event found in "
                f"{case['search_start_date']}..{case['search_end_date']}; "
                f"inspected dates: {', '.join(inspected_dates) or 'none'}"
            ),
            inspected_dates=inspected_dates,
        )

    failure = _evaluate_assertions(
        case=case,
        timeline=timeline,
        event_point=event_point,
        strategy_id=strategy_id,
    )
    if failure is not None:
        return EventValidationResult(
            case_id=case_id,
            passed=False,
            event_date=_point_date(event_point),
            message=failure,
        )
    return EventValidationResult(
        case_id=case_id,
        passed=True,
        event_date=_point_date(event_point),
        message="passed",
    )


def render_markdown_report(results: Sequence[EventValidationResult]) -> str:
    lines = [
        "# Hierarchical Regression Event Validation",
        "",
        "| Case | Status | Event Date | Message |",
        "|---|---|---|---|",
    ]
    for result in results:
        status = "PASS" if result.passed else "FAIL"
        lines.append(
            "| "
            + " | ".join(
                (
                    result.case_id,
                    status,
                    result.event_date or "n/a",
                    result.message.replace("|", "\\|"),
                )
            )
            + " |"
        )
    return "\n".join(lines) + "\n"


def all_passed(results: Sequence[EventValidationResult]) -> bool:
    return all(result.passed for result in results)


def _timeline(payload: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    timeline = payload.get("timeline")
    if not isinstance(timeline, list):
        raise ValueError("Compare payload must include timeline array")
    return [point for point in timeline if isinstance(point, Mapping)]


def _find_event_point(
    *,
    case: Mapping[str, Any],
    points: Sequence[Mapping[str, Any]],
    timeline: Sequence[Mapping[str, Any]],
    strategy_id: str,
) -> Mapping[str, Any] | None:
    event_type = str(case["event_type"])
    for point in points:
        if event_type == "crypto_cross_down" and _is_crypto_cross_down(
            point=point,
            strategy_id=strategy_id,
            reference_asset=_optional_upper(case.get("reference_asset")),
        ):
            return point
        if event_type == "crypto_cross_up" and _is_crypto_cross_up(
            point=point,
            strategy_id=strategy_id,
            reference_asset=_optional_upper(case.get("reference_asset")),
        ):
            return point
        if event_type == "spy_cross_down" and (
            _dma_details(
                point=point,
                strategy_id=strategy_id,
                key="spy_dma",
            ).get("cross_event")
            == "cross_down"
        ):
            return point
        if (
            event_type == "spy_cross_up"
            and _dma_details(
                point=point,
                strategy_id=strategy_id,
                key="spy_dma",
            ).get("cross_event")
            == "cross_up"
        ):
            return point
        if event_type == "extreme_fear_below_crypto_dma" and (
            _sentiment_label(point=point, strategy_id=strategy_id) == "extreme_fear"
            and _dma_details(point=point, strategy_id=strategy_id, key="dma").get(
                "zone"
            )
            == "below"
        ):
            return point
        if event_type == "eth_btc_ratio_cross_up" and _is_inner_ratio_cross(
            timeline=timeline,
            point=point,
            strategy_id=strategy_id,
            from_zone="below",
            to_zone="above",
        ):
            return point
        if event_type == "eth_btc_ratio_cross_down" and _is_inner_ratio_cross(
            timeline=timeline,
            point=point,
            strategy_id=strategy_id,
            from_zone="above",
            to_zone="below",
        ):
            return point
    return None


def _is_crypto_cross_down(
    *,
    point: Mapping[str, Any],
    strategy_id: str,
    reference_asset: str | None,
) -> bool:
    dma = _dma_details(point=point, strategy_id=strategy_id, key="dma")
    if dma.get("cross_event") != "cross_down":
        return False
    if reference_asset is None:
        return True
    observed_reference = _optional_upper(dma.get("outer_dma_reference_asset"))
    return observed_reference == reference_asset


def _is_crypto_cross_up(
    *,
    point: Mapping[str, Any],
    strategy_id: str,
    reference_asset: str | None,
) -> bool:
    dma = _dma_details(point=point, strategy_id=strategy_id, key="dma")
    if dma.get("cross_event") != "cross_up":
        return False
    if reference_asset is None:
        return True
    observed_reference = _optional_upper(dma.get("outer_dma_reference_asset"))
    return observed_reference == reference_asset


def _is_inner_ratio_cross(
    *,
    timeline: Sequence[Mapping[str, Any]],
    point: Mapping[str, Any],
    strategy_id: str,
    from_zone: str,
    to_zone: str,
) -> bool:
    previous_point = _previous_point(timeline=timeline, event_point=point)
    if previous_point is None:
        return False
    return (
        _inner_ratio_zone(point=previous_point, strategy_id=strategy_id) == from_zone
        and _inner_ratio_zone(point=point, strategy_id=strategy_id) == to_zone
    )


def _evaluate_assertions(
    *,
    case: Mapping[str, Any],
    timeline: Sequence[Mapping[str, Any]],
    event_point: Mapping[str, Any],
    strategy_id: str,
) -> str | None:
    previous_point = _previous_point(timeline=timeline, event_point=event_point)
    for assertion in case.get("assertions", []):
        if not isinstance(assertion, Mapping):
            return "Assertion entry must be an object"
        failure = _evaluate_assertion(
            assertion=assertion,
            timeline=timeline,
            event_point=event_point,
            previous_point=previous_point,
            strategy_id=strategy_id,
        )
        if failure is not None:
            return failure
    return None


def _evaluate_assertion(
    *,
    assertion: Mapping[str, Any],
    timeline: Sequence[Mapping[str, Any]],
    event_point: Mapping[str, Any],
    previous_point: Mapping[str, Any] | None,
    strategy_id: str,
) -> str | None:
    assertion_type = assertion.get("type")
    if assertion_type == "target_asset_equals":
        return _assert_asset_compare(
            assertion=assertion,
            point=event_point,
            strategy_id=strategy_id,
            comparator="equals",
        )
    if assertion_type in {"target_asset_greater_than", "target_asset_gt"}:
        return _assert_asset_compare(
            assertion=assertion,
            point=event_point,
            strategy_id=strategy_id,
            comparator="greater_than",
        )
    if assertion_type in {
        "target_asset_greater_than_previous",
        "target_asset_increased_from_previous",
    }:
        return _assert_asset_vs_previous(
            assertion=assertion,
            point=event_point,
            previous_point=previous_point,
            strategy_id=strategy_id,
            comparator="greater_than",
        )
    if assertion_type in {
        "target_asset_less_than_previous",
        "target_asset_decreased_from_previous",
    }:
        return _assert_asset_vs_previous(
            assertion=assertion,
            point=event_point,
            previous_point=previous_point,
            strategy_id=strategy_id,
            comparator="less_than",
        )
    if assertion_type in {
        "target_asset_not_greater_than_previous",
        "target_asset_not_increased_from_previous",
    }:
        return _assert_asset_vs_previous(
            assertion=assertion,
            point=event_point,
            previous_point=previous_point,
            strategy_id=strategy_id,
            comparator="not_greater_than",
        )
    if assertion_type in {
        "target_asset_not_greater_than_current",
        "target_asset_not_increased_from_current",
    }:
        return _assert_asset_vs_current(
            assertion=assertion,
            point=event_point,
            strategy_id=strategy_id,
            comparator="not_greater_than",
        )
    if assertion_type == "target_asset_gte":
        return _assert_asset_compare(
            assertion=assertion,
            point=event_point,
            strategy_id=strategy_id,
            comparator="greater_than_or_equal",
        )
    if assertion_type in {
        "target_crypto_greater_than_previous",
        "target_crypto_increased_from_previous",
    }:
        return _assert_crypto_vs_previous(
            point=event_point,
            previous_point=previous_point,
            strategy_id=strategy_id,
            comparator="greater_than",
        )
    if assertion_type == "target_stable_decreased_from_previous":
        return _assert_asset_vs_previous(
            assertion={"asset": "stable"},
            point=event_point,
            previous_point=previous_point,
            strategy_id=strategy_id,
            comparator="less_than",
        )
    if assertion_type == "target_stable_increased_from_previous":
        return _assert_asset_vs_previous(
            assertion={"asset": "stable"},
            point=event_point,
            previous_point=previous_point,
            strategy_id=strategy_id,
            comparator="greater_than",
        )
    if assertion_type == "target_spy_not_increased_from_previous":
        return _assert_asset_vs_previous(
            assertion={"asset": "spy"},
            point=event_point,
            previous_point=previous_point,
            strategy_id=strategy_id,
            comparator="not_greater_than",
        )
    if assertion_type == "target_spy_not_greater_than_current":
        return _assert_asset_vs_current(
            assertion={"asset": "spy"},
            point=event_point,
            strategy_id=strategy_id,
            comparator="not_greater_than",
        )
    if assertion_type == "if_current_crypto_gt_target_asset_equals":
        return _assert_if_current_crypto_gt_asset_compare(
            assertion=assertion,
            point=event_point,
            strategy_id=strategy_id,
            comparator="equals",
        )
    if assertion_type == "if_current_crypto_gt_target_asset_gt":
        return _assert_if_current_crypto_gt_asset_compare(
            assertion=assertion,
            point=event_point,
            strategy_id=strategy_id,
            comparator="greater_than",
        )
    if assertion_type == "eventually_target_asset_greater_than_previous":
        return _assert_eventual_asset_vs_previous(
            assertion=assertion,
            timeline=timeline,
            event_point=event_point,
            strategy_id=strategy_id,
            comparator="greater_than",
        )
    if assertion_type == "eventually_target_asset_less_than_previous":
        return _assert_eventual_asset_vs_previous(
            assertion=assertion,
            timeline=timeline,
            event_point=event_point,
            strategy_id=strategy_id,
            comparator="less_than",
        )
    if assertion_type == "decision_action_in":
        return _assert_decision_action_in(
            assertion=assertion,
            point=event_point,
            strategy_id=strategy_id,
        )
    if assertion_type == "decision_reason_in":
        return _assert_decision_reason_in(
            assertion=assertion,
            point=event_point,
            strategy_id=strategy_id,
        )
    return f"Unsupported assertion type: {assertion_type!r}"


def _assert_asset_compare(
    *,
    assertion: Mapping[str, Any],
    point: Mapping[str, Any],
    strategy_id: str,
    comparator: str,
) -> str | None:
    asset = _asset_from_assertion(assertion)
    actual = _target_asset(point=point, strategy_id=strategy_id, asset=asset)
    expected = float(assertion.get("value", 0.0))
    if comparator == "equals" and abs(actual - expected) > EPSILON:
        return _failure(point, f"target {asset}={actual:.6f}; expected {expected:.6f}")
    if comparator == "greater_than" and actual <= expected + EPSILON:
        return _failure(
            point, f"target {asset}={actual:.6f}; expected > {expected:.6f}"
        )
    if comparator == "greater_than_or_equal" and actual < expected - EPSILON:
        return _failure(
            point,
            f"target {asset}={actual:.6f}; expected >= {expected:.6f}",
        )
    return None


def _assert_asset_vs_previous(
    *,
    assertion: Mapping[str, Any],
    point: Mapping[str, Any],
    previous_point: Mapping[str, Any] | None,
    strategy_id: str,
    comparator: str,
) -> str | None:
    if previous_point is None:
        return _failure(
            point, "No previous point available for previous-allocation assertion"
        )
    asset = _asset_from_assertion(assertion)
    actual = _target_asset(point=point, strategy_id=strategy_id, asset=asset)
    previous = _portfolio_asset(
        point=previous_point, strategy_id=strategy_id, asset=asset
    )
    return _compare_current_to_previous(
        point=point,
        label=f"target {asset}",
        actual=actual,
        previous=previous,
        comparator=comparator,
    )


def _assert_asset_vs_current(
    *,
    assertion: Mapping[str, Any],
    point: Mapping[str, Any],
    strategy_id: str,
    comparator: str,
) -> str | None:
    asset = _asset_from_assertion(assertion)
    actual = _target_asset(point=point, strategy_id=strategy_id, asset=asset)
    current = _portfolio_asset(point=point, strategy_id=strategy_id, asset=asset)
    return _compare_current_to_previous(
        point=point,
        label=f"target {asset}",
        actual=actual,
        previous=current,
        comparator=comparator,
        previous_label="current",
    )


def _assert_if_current_crypto_gt_asset_compare(
    *,
    assertion: Mapping[str, Any],
    point: Mapping[str, Any],
    strategy_id: str,
    comparator: str,
) -> str | None:
    current_crypto = _portfolio_crypto(point=point, strategy_id=strategy_id)
    threshold = float(assertion.get("current_crypto_threshold", EPSILON))
    if current_crypto <= threshold:
        return None
    return _assert_asset_compare(
        assertion=assertion,
        point=point,
        strategy_id=strategy_id,
        comparator=comparator,
    )


def _assert_crypto_vs_previous(
    *,
    point: Mapping[str, Any],
    previous_point: Mapping[str, Any] | None,
    strategy_id: str,
    comparator: str,
) -> str | None:
    if previous_point is None:
        return _failure(point, "No previous point available for crypto assertion")
    actual = _target_crypto(point=point, strategy_id=strategy_id)
    previous = _portfolio_crypto(point=previous_point, strategy_id=strategy_id)
    return _compare_current_to_previous(
        point=point,
        label="target crypto",
        actual=actual,
        previous=previous,
        comparator=comparator,
    )


def _assert_eventual_asset_vs_previous(
    *,
    assertion: Mapping[str, Any],
    timeline: Sequence[Mapping[str, Any]],
    event_point: Mapping[str, Any],
    strategy_id: str,
    comparator: str,
) -> str | None:
    asset = _asset_from_assertion(assertion)
    within_days = int(assertion.get("within_days", 0))
    event_date = _parse_date(_point_date(event_point))
    end_date = event_date + timedelta(days=max(0, within_days))
    inspected: list[str] = []
    for point in timeline:
        point_date = _parse_date(_point_date(point))
        if point_date < event_date or point_date > end_date:
            continue
        previous_point = _previous_point(timeline=timeline, event_point=point)
        if previous_point is None:
            continue
        inspected.append(_point_date(point))
        actual = _target_asset(point=point, strategy_id=strategy_id, asset=asset)
        previous = _portfolio_asset(
            point=previous_point, strategy_id=strategy_id, asset=asset
        )
        if _comparison_passes(actual=actual, previous=previous, comparator=comparator):
            return None
    return _failure(
        event_point,
        f"No point within {within_days} days satisfied {asset} {comparator} previous; "
        f"inspected dates: {', '.join(inspected) or 'none'}",
    )


def _assert_decision_action_in(
    *,
    assertion: Mapping[str, Any],
    point: Mapping[str, Any],
    strategy_id: str,
) -> str | None:
    expected = assertion.get("values")
    if not isinstance(expected, list):
        return _failure(point, "decision_action_in assertion must define values array")
    action = _decision(point=point, strategy_id=strategy_id).get("action")
    if action not in expected:
        return _failure(
            point, f"decision action={action!r}; expected one of {expected!r}"
        )
    return None


def _assert_decision_reason_in(
    *,
    assertion: Mapping[str, Any],
    point: Mapping[str, Any],
    strategy_id: str,
) -> str | None:
    expected = assertion.get("values") or assertion.get("reasons")
    if not isinstance(expected, list):
        return _failure(point, "decision_reason_in assertion must define values array")
    reason = _decision(point=point, strategy_id=strategy_id).get("reason")
    if reason not in expected:
        return _failure(
            point, f"decision reason={reason!r}; expected one of {expected!r}"
        )
    return None


def _compare_current_to_previous(
    *,
    point: Mapping[str, Any],
    label: str,
    actual: float,
    previous: float,
    comparator: str,
    previous_label: str = "previous",
) -> str | None:
    if _comparison_passes(actual=actual, previous=previous, comparator=comparator):
        return None
    symbol = {
        "greater_than": ">",
        "less_than": "<",
        "not_greater_than": "<=",
    }.get(comparator, comparator)
    return _failure(
        point,
        f"{label}={actual:.6f}; expected {symbol} {previous_label} {previous:.6f}",
    )


def _comparison_passes(*, actual: float, previous: float, comparator: str) -> bool:
    if comparator == "greater_than":
        return actual > previous + EPSILON
    if comparator == "less_than":
        return actual < previous - EPSILON
    if comparator == "not_greater_than":
        return actual <= previous + EPSILON
    raise ValueError(f"Unsupported comparator: {comparator}")


def _asset_from_assertion(assertion: Mapping[str, Any]) -> str:
    asset = str(assertion.get("asset", "")).lower()
    if asset not in ASSET_KEYS:
        raise ValueError(f"Unsupported asset in assertion: {asset!r}")
    return asset


def _target_crypto(*, point: Mapping[str, Any], strategy_id: str) -> float:
    return _target_asset(
        point=point, strategy_id=strategy_id, asset="btc"
    ) + _target_asset(
        point=point,
        strategy_id=strategy_id,
        asset="eth",
    )


def _portfolio_crypto(*, point: Mapping[str, Any], strategy_id: str) -> float:
    return _portfolio_asset(
        point=point,
        strategy_id=strategy_id,
        asset="btc",
    ) + _portfolio_asset(point=point, strategy_id=strategy_id, asset="eth")


def _target_asset(*, point: Mapping[str, Any], strategy_id: str, asset: str) -> float:
    target = _decision(point=point, strategy_id=strategy_id).get("target_allocation")
    if not isinstance(target, Mapping):
        return 0.0
    return _number(target.get(asset))


def _portfolio_asset(
    *, point: Mapping[str, Any], strategy_id: str, asset: str
) -> float:
    portfolio = _strategy_state(point=point, strategy_id=strategy_id).get("portfolio")
    if not isinstance(portfolio, Mapping):
        return 0.0
    allocation = portfolio.get("asset_allocation")
    if not isinstance(allocation, Mapping):
        return 0.0
    return _number(allocation.get(asset))


def _dma_details(
    *, point: Mapping[str, Any], strategy_id: str, key: str
) -> Mapping[str, Any]:
    signal = _strategy_state(point=point, strategy_id=strategy_id).get("signal")
    if not isinstance(signal, Mapping):
        return {}
    details = signal.get("details")
    if not isinstance(details, Mapping):
        return {}
    dma = details.get(key)
    return dma if isinstance(dma, Mapping) else {}


def _decision(*, point: Mapping[str, Any], strategy_id: str) -> Mapping[str, Any]:
    decision = _strategy_state(point=point, strategy_id=strategy_id).get("decision")
    return decision if isinstance(decision, Mapping) else {}


def _inner_ratio_zone(*, point: Mapping[str, Any], strategy_id: str) -> str | None:
    details = _decision(point=point, strategy_id=strategy_id).get("details")
    if not isinstance(details, Mapping):
        return None
    zone = details.get("inner_ratio_zone")
    return str(zone) if isinstance(zone, str) else None


def _strategy_state(*, point: Mapping[str, Any], strategy_id: str) -> Mapping[str, Any]:
    strategies = point.get("strategies")
    if not isinstance(strategies, Mapping):
        return {}
    state = strategies.get(strategy_id)
    return state if isinstance(state, Mapping) else {}


def _points_in_window(
    *,
    timeline: Sequence[Mapping[str, Any]],
    start_date: date,
    end_date: date,
) -> list[Mapping[str, Any]]:
    return [
        point
        for point in timeline
        if start_date <= _parse_date(_point_date(point)) <= end_date
    ]


def _previous_point(
    *,
    timeline: Sequence[Mapping[str, Any]],
    event_point: Mapping[str, Any],
) -> Mapping[str, Any] | None:
    event_date = _parse_date(_point_date(event_point))
    previous_points = [
        point for point in timeline if _parse_date(_point_date(point)) < event_date
    ]
    if not previous_points:
        return None
    return max(previous_points, key=lambda point: _parse_date(_point_date(point)))


def _point_date(point: Mapping[str, Any]) -> str:
    market = point.get("market")
    if isinstance(market, Mapping):
        raw_date = market.get("date")
        if isinstance(raw_date, str):
            return raw_date
    raw_date = point.get("date")
    if isinstance(raw_date, str):
        return raw_date
    raise ValueError("Timeline point is missing market.date")


def _sentiment_label(*, point: Mapping[str, Any], strategy_id: str) -> str | None:
    market = point.get("market")
    if isinstance(market, Mapping):
        label = market.get("sentiment_label")
        if label is not None:
            return str(label).lower()
    state = _strategy_state(point=point, strategy_id=strategy_id)
    signal = state.get("signal")
    if isinstance(signal, Mapping):
        regime = signal.get("regime")
        if regime is not None:
            return str(regime).lower()
    return None


def _failure(point: Mapping[str, Any], message: str) -> str:
    return f"{_point_date(point)}: {message}"


def _parse_date(raw: str) -> date:
    return date.fromisoformat(raw)


def _optional_upper(value: Any) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    return value.upper()


def _number(value: Any) -> float:
    return (
        float(value)
        if isinstance(value, int | float) and not isinstance(value, bool)
        else 0.0
    )


__all__ = [
    "DEFAULT_CONFIG_ID",
    "DEFAULT_STRATEGY_ID",
    "EventValidationResult",
    "all_passed",
    "build_compare_request",
    "load_event_cases",
    "render_markdown_report",
    "validate_case",
    "validate_cases",
]
