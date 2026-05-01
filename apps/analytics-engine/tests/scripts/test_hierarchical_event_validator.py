from __future__ import annotations

from pathlib import Path
from typing import Any

from scripts.attribution.hierarchical_event_validator import (
    DEFAULT_CONFIG_ID,
    build_compare_request,
    load_event_cases,
    render_markdown_report,
    validate_case,
)

FIXTURE_PATH = Path("tests/fixtures/hierarchical_validation_events.json")


def _point(
    snapshot_date: str,
    *,
    target: dict[str, float],
    portfolio: dict[str, float],
    dma_cross: str | None = None,
    dma_zone: str = "above",
    reference_asset: str = "BTC",
    spy_dma_cross: str | None = None,
    sentiment_label: str = "neutral",
    action: str = "hold",
    reason: str = "regime_no_signal",
) -> dict[str, Any]:
    return {
        "market": {
            "date": snapshot_date,
            "token_price": {"btc": 100.0, "eth": 5.0, "spy": 600.0},
            "sentiment": 15 if sentiment_label == "extreme_fear" else 50,
            "sentiment_label": sentiment_label,
        },
        "strategies": {
            DEFAULT_CONFIG_ID: {
                "portfolio": {
                    "asset_allocation": {**portfolio, "alt": 0.0},
                    "allocation": {
                        "spot": portfolio["btc"] + portfolio["eth"] + portfolio["spy"],
                        "stable": portfolio["stable"],
                    },
                    "spot_usd": 0.0,
                    "stable_usd": 0.0,
                    "total_value": 10_000.0,
                    "spot_asset": None,
                },
                "signal": {
                    "id": "hierarchical_spy_crypto_signal",
                    "regime": sentiment_label,
                    "confidence": 1.0,
                    "raw_value": 15.0 if sentiment_label == "extreme_fear" else 50.0,
                    "details": {
                        "dma": {
                            "zone": dma_zone,
                            "cross_event": dma_cross,
                            "outer_dma_action_unit": "CRYPTO",
                            "outer_dma_reference_asset": reference_asset,
                        },
                        "spy_dma": {
                            "zone": "above" if spy_dma_cross == "cross_up" else "below",
                            "cross_event": spy_dma_cross,
                        },
                    },
                },
                "decision": {
                    "action": action,
                    "reason": reason,
                    "rule_group": "cross" if dma_cross or spy_dma_cross else "dma_fgi",
                    "target_allocation": {**target, "alt": 0.0},
                    "immediate": bool(dma_cross or spy_dma_cross),
                },
                "execution": {"event": "rebalance", "transfers": []},
            }
        },
    }


def test_load_event_cases_and_build_compare_request() -> None:
    cases = load_event_cases(FIXTURE_PATH)

    request = build_compare_request(cases=cases)

    assert len(cases) == 7
    assert request["start_date"] == "2025-01-01"
    assert request["end_date"] == "2026-04-10"
    assert request["configs"][0]["strategy_id"] == DEFAULT_CONFIG_ID


def test_cross_down_event_passes_when_crypto_clears_to_stable() -> None:
    case = {
        "id": "mock_cross_down",
        "event_type": "crypto_cross_down",
        "reference_asset": "BTC",
        "search_start_date": "2025-03-08",
        "search_end_date": "2025-03-09",
        "assertions": [
            {"type": "target_asset_equals", "asset": "btc", "value": 0.0},
            {"type": "target_asset_equals", "asset": "eth", "value": 0.0},
            {"type": "target_asset_greater_than_previous", "asset": "stable"},
        ],
    }
    timeline = [
        _point(
            "2025-03-07",
            target={"btc": 0.4, "eth": 0.1, "spy": 0.0, "stable": 0.5},
            portfolio={"btc": 0.4, "eth": 0.1, "spy": 0.0, "stable": 0.5},
        ),
        _point(
            "2025-03-08",
            target={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0},
            portfolio={"btc": 0.4, "eth": 0.1, "spy": 0.0, "stable": 0.5},
            dma_cross="cross_down",
            action="sell",
            reason="dma_cross_down",
        ),
    ]

    result = validate_case(case=case, timeline=timeline)

    assert result.passed is True
    assert result.event_date == "2025-03-08"


def test_missing_cross_event_reports_inspected_dates() -> None:
    case = {
        "id": "missing_cross",
        "event_type": "crypto_cross_down",
        "reference_asset": "BTC",
        "search_start_date": "2025-03-08",
        "search_end_date": "2025-03-09",
        "assertions": [{"type": "target_asset_equals", "asset": "btc", "value": 0.0}],
    }
    timeline = [
        _point(
            "2025-03-08",
            target={"btc": 0.4, "eth": 0.1, "spy": 0.0, "stable": 0.5},
            portfolio={"btc": 0.4, "eth": 0.1, "spy": 0.0, "stable": 0.5},
        )
    ]

    result = validate_case(case=case, timeline=timeline)

    assert result.passed is False
    assert "No matching crypto_cross_down event" in result.message
    assert "2025-03-08" in result.message


def test_wrong_crypto_cash_routing_to_spy_fails() -> None:
    case = {
        "id": "wrong_routing",
        "event_type": "crypto_cross_down",
        "reference_asset": "BTC",
        "search_start_date": "2025-10-16",
        "search_end_date": "2025-10-16",
        "assertions": [
            {"type": "target_spy_not_greater_than_current"},
            {"type": "target_asset_greater_than_previous", "asset": "stable"},
        ],
    }
    timeline = [
        _point(
            "2025-10-15",
            target={"btc": 0.3, "eth": 0.0, "spy": 0.4, "stable": 0.3},
            portfolio={"btc": 0.3, "eth": 0.0, "spy": 0.4, "stable": 0.3},
        ),
        _point(
            "2025-10-16",
            target={"btc": 0.0, "eth": 0.0, "spy": 0.7, "stable": 0.3},
            portfolio={"btc": 0.3, "eth": 0.0, "spy": 0.4, "stable": 0.3},
            dma_cross="cross_down",
            action="sell",
            reason="dma_cross_down",
        ),
    ]

    result = validate_case(case=case, timeline=timeline)

    assert result.passed is False
    assert "target spy=0.700000; expected <= current 0.400000" in result.message


def test_extreme_fear_without_dca_buy_fails() -> None:
    case = {
        "id": "no_dca",
        "event_type": "extreme_fear_below_crypto_dma",
        "search_start_date": "2025-11-21",
        "search_end_date": "2025-11-21",
        "assertions": [{"type": "target_crypto_greater_than_previous"}],
    }
    timeline = [
        _point(
            "2025-11-20",
            target={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0},
            portfolio={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0},
        ),
        _point(
            "2025-11-21",
            target={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0},
            portfolio={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0},
            dma_zone="below",
            sentiment_label="extreme_fear",
        ),
    ]

    result = validate_case(case=case, timeline=timeline)

    assert result.passed is False
    assert "target crypto=0.000000; expected > previous 0.000000" in result.message


def test_spy_cross_up_without_redeploy_fails() -> None:
    case = {
        "id": "no_spy_redeploy",
        "event_type": "spy_cross_up",
        "search_start_date": "2026-04-06",
        "search_end_date": "2026-04-06",
        "assertions": [
            {
                "type": "eventually_target_asset_greater_than_previous",
                "asset": "spy",
                "within_days": 2,
            }
        ],
    }
    timeline = [
        _point(
            "2026-04-05",
            target={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0},
            portfolio={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0},
        ),
        _point(
            "2026-04-06",
            target={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0},
            portfolio={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0},
            spy_dma_cross="cross_up",
        ),
        _point(
            "2026-04-07",
            target={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0},
            portfolio={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0},
        ),
    ]

    result = validate_case(case=case, timeline=timeline)

    assert result.passed is False
    assert (
        "No point within 2 days satisfied spy greater_than previous" in result.message
    )


def test_markdown_report_marks_failures() -> None:
    case = {
        "id": "missing_cross",
        "event_type": "crypto_cross_down",
        "search_start_date": "2025-03-08",
        "search_end_date": "2025-03-08",
        "assertions": [{"type": "target_asset_equals", "asset": "btc", "value": 0.0}],
    }
    result = validate_case(
        case=case,
        timeline=[
            _point(
                "2025-03-08",
                target={"btc": 0.4, "eth": 0.1, "spy": 0.0, "stable": 0.5},
                portfolio={"btc": 0.4, "eth": 0.1, "spy": 0.0, "stable": 0.5},
            )
        ],
    )

    report = render_markdown_report([result])

    assert "| missing_cross | FAIL | n/a |" in report
