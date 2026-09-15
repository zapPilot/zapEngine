"""Behavioral edge cases for validation constraint predicates."""

from __future__ import annotations

import pytest

from src.services.backtesting.validation.constraint_predicates import (
    ValidationEventError,
    constraint_asset,
    constraint_comparison_passes,
    constraint_dma,
    constraint_inner_ratio_zone,
    constraint_macro_sentiment_label,
    constraint_portfolio_crypto,
    constraint_sentiment_label,
    constraint_target_asset,
    constraint_target_crypto,
    evaluate_constraint_assertion,
    normalize_constraint_label,
    parse_date,
    point_for_date,
)


def point(
    day: str = "2026-01-02",
    *,
    target: dict[str, float] | None = None,
    allocation: dict[str, float] | None = None,
    decision: dict[str, object] | None = None,
    signal: dict[str, object] | None = None,
    market: dict[str, object] | None = None,
) -> dict[str, object]:
    value: dict[str, object] = {"date": day}
    if target is not None or decision is not None:
        value["decision"] = {
            **(decision or {}),
            **({"target_allocation": target} if target is not None else {}),
        }
    if allocation is not None:
        value["portfolio"] = {"asset_allocation": allocation}
    if signal is not None:
        value["signal"] = signal
    if market is not None:
        value["market"] = market
    return value


def evaluate(
    assertion: dict[str, object], event: dict[str, object], *history: dict[str, object]
) -> str | None:
    return evaluate_constraint_assertion(
        assertion=assertion,
        points=[*history, event],
        event_point=event,
    )


def test_malformed_helper_inputs_are_rejected_or_use_safe_defaults() -> None:
    with pytest.raises(ValidationEventError, match="Invalid date value"):
        parse_date("not-a-date")
    assert normalize_constraint_label(123) is None
    with pytest.raises(ValidationEventError, match="Unsupported asset"):
        constraint_asset({"asset": "cash"})
    with pytest.raises(ValidationEventError, match="Unsupported constraint comparator"):
        constraint_comparison_passes(actual=1, previous=1, comparator="approximately")

    malformed = point(decision={"target_allocation": "not-a-map"})
    assert constraint_target_asset(malformed, asset="btc") == 0.0
    assert constraint_portfolio_crypto(point()) == 0.0
    assert point_for_date(points=[point()], event_date="2099-01-01") is None


def test_signal_accessors_support_direct_and_fallback_shapes() -> None:
    assert constraint_dma(point(signal={"ratio": {"zone": "direct"}}), key="ratio") == {
        "zone": "direct"
    }
    assert (
        constraint_inner_ratio_zone(
            point(decision={"details": {"inner_ratio_zone": "decision"}})
        )
        == "decision"
    )
    assert (
        constraint_sentiment_label(point(signal={"regime": "Risk-Off"})) == "risk_off"
    )
    assert (
        constraint_macro_sentiment_label(
            point(market={"macro_fear_greed": {"raw_rating": "Extreme Fear"}})
        )
        == "extreme_fear"
    )
    assert constraint_macro_sentiment_label(point()) is None


def test_crypto_accessors_sum_btc_and_eth_allocations() -> None:
    current = point(
        target={"btc": 0.4, "eth": 0.2}, allocation={"btc": 0.3, "eth": 0.1}
    )
    assert constraint_target_crypto(current) == pytest.approx(0.6)
    assert constraint_portfolio_crypto(current) == pytest.approx(0.4)


def test_fixed_asset_comparison_reports_observable_failure() -> None:
    event = point(target={"btc": 0.2})
    failure = evaluate(
        {"type": "target_asset_greater_than", "asset": "btc", "value": 0.5},
        event,
    )
    assert failure == "2026-01-02: target btc=0.200000; expected > 0.500000"


def test_previous_allocation_assertions_require_history() -> None:
    event = point(target={"btc": 0.4})
    failure = evaluate(
        {"type": "target_asset_greater_than_previous", "asset": "btc"},
        event,
    )
    assert failure == (
        "2026-01-02: No previous point available for previous-allocation assertion"
    )

    crypto_failure = evaluate({"type": "target_crypto_greater_than_previous"}, event)
    assert (
        crypto_failure == "2026-01-02: No previous point available for crypto assertion"
    )


def test_previous_crypto_assertion_compares_combined_allocations() -> None:
    previous = point("2026-01-01", allocation={"btc": 0.2, "eth": 0.1})
    event = point(target={"btc": 0.1, "eth": 0.1})
    failure = evaluate({"type": "target_crypto_greater_than_previous"}, event, previous)
    assert failure == (
        "2026-01-02: target crypto=0.200000; expected > previous 0.300000"
    )


def test_crypto_gate_skips_zero_crypto_and_enforces_when_invested() -> None:
    assertion = {
        "type": "if_current_crypto_gt_target_asset_equals",
        "asset": "stable",
        "value": 0.5,
    }
    assert (
        evaluate(assertion, point(target={"stable": 0.1}, allocation={"btc": 0.0}))
        is None
    )

    failure = evaluate(
        assertion,
        point(target={"stable": 0.1}, allocation={"btc": 0.2, "eth": 0.1}),
    )
    assert failure == "2026-01-02: target stable=0.100000; expected 0.500000"


def test_eventual_comparison_ignores_out_of_window_points_and_reports_dates() -> None:
    before = point("2026-01-01", allocation={"btc": 0.5})
    event = point("2026-01-02", target={"btc": 0.4})
    after_window = point("2026-01-05", target={"btc": 0.9})
    failure = evaluate_constraint_assertion(
        assertion={
            "type": "eventually_target_asset_greater_than_previous",
            "asset": "btc",
            "within_days": 1,
        },
        points=[before, event, after_window],
        event_point=event,
    )
    assert failure == (
        "2026-01-02: No point within 1 days satisfied btc greater_than previous; "
        "inspected dates: 2026-01-02"
    )


def test_decision_action_predicates_validate_schema_and_values() -> None:
    event = point(decision={"action": "hold"})
    assert "must define values array" in evaluate({"type": "decision_action_in"}, event)
    assert "expected one of ['buy']" in evaluate(
        {"type": "decision_action_in", "values": ["buy"]}, event
    )
    assert "expected 'buy'" in evaluate(
        {"type": "decision_action_equals", "value": "buy"}, event
    )


def test_decision_detail_and_rule_predicates_report_mismatches() -> None:
    event = point(
        decision={"details": {"matched_rule_name": "risk_off", "regime": "neutral"}}
    )
    assert "expected value other than 'risk_off'" in evaluate(
        {"type": "matched_rule_name_not_equals", "value": "risk_off"}, event
    )
    assert "must define key" in evaluate({"type": "decision_detail_equals"}, event)
    assert "decision detail regime='neutral'; expected 'risk_on'" in evaluate(
        {"type": "decision_detail_equals", "key": "regime", "value": "risk_on"},
        event,
    )


def test_decision_reason_accepts_alias_and_reports_invalid_contracts() -> None:
    event = point(decision={"reason": "quota_exhausted"})
    assert "must define values array" in evaluate({"type": "decision_reason_in"}, event)
    assert "expected one of ['risk_limit']" in evaluate(
        {"type": "decision_reason_in", "reasons": ["risk_limit"]}, event
    )
    assert (
        evaluate({"type": "decision_reason_in", "values": ["quota_exhausted"]}, event)
        is None
    )


def test_ratio_zone_requires_expected_zone_and_reports_mismatch() -> None:
    event = point(signal={"details": {"ratio": {"zone": "inner"}}})
    assert "must define zone" in evaluate({"type": "ratio_zone_equals"}, event)
    assert "ratio zone='inner'; expected 'outer'" in evaluate(
        {"type": "ratio_zone_equals", "zone": "outer"}, event
    )


@pytest.mark.parametrize("assertion_type", [None, "unknown_assertion"])
def test_dispatch_rejects_unsupported_assertion_types(assertion_type: object) -> None:
    event = point()
    failure = evaluate({"type": assertion_type}, event)
    assert failure == f"2026-01-02: Unsupported assertion type: {assertion_type!r}"
