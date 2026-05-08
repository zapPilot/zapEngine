from __future__ import annotations

import json
from pathlib import Path

from src.services.backtesting.validation.event_runner import (
    ValidationEvent,
    evaluate_event,
    load_validation_events,
)


def test_load_validation_events_promotes_applicable_strategies(tmp_path: Path) -> None:
    fixture = tmp_path / "events.json"
    fixture.write_text(
        json.dumps(
            {
                "2025-04-22": {
                    "events": [
                        {
                            "id": "btc_cross_up",
                            "event_type": "crypto_cross_up",
                            "reference_asset": "BTC",
                            "applicable_strategies": ["dma_fgi_portfolio_rules"],
                            "assertions": [
                                {
                                    "type": "target_asset_equals",
                                    "asset": "stable",
                                    "value": 0.0,
                                }
                            ],
                        }
                    ]
                }
            }
        )
    )

    events = load_validation_events(fixture)

    assert len(events) == 1
    assert events[0].id == "btc_cross_up"
    assert events[0].event_date == "2025-04-22"
    assert events[0].applicable_strategies == ("dma_fgi_portfolio_rules",)


def test_evaluate_event_returns_structured_pass_result() -> None:
    event = load_validation_events(
        Path(__file__).resolve().parents[3]
        / "fixtures/hierarchical_validation_events.json",
        event_ids=["btc_cross_up_2025_04_22"],
    )[0]
    timeline = [
        {
            "date": "2025-04-21",
            "portfolio": {"asset_allocation": {"btc": 0.0, "stable": 1.0}},
            "decision": {"target_allocation": {"btc": 0.0, "stable": 1.0}},
            "signal": {"details": {"dma": {"cross_event": None}}},
        },
        {
            "date": "2025-04-22",
            "market": {"sentiment_label": "neutral"},
            "portfolio": {"asset_allocation": {"btc": 0.0, "stable": 1.0}},
            "decision": {"target_allocation": {"btc": 1.0, "stable": 0.0}},
            "signal": {
                "details": {
                    "dma": {
                        "cross_event": "cross_up",
                        "outer_dma_reference_asset": "BTC",
                    }
                }
            },
        },
    ]

    result = evaluate_event(event, timeline)

    assert result.passed is True
    assert result.status == "PASS"
    assert result.assertions_checked == 2
    assert result.to_dict()["id"] == "btc_cross_up_2025_04_22"


def test_extreme_fear_crypto_dma_trigger_scans_assertion_window() -> None:
    event = ValidationEvent(
        id="extreme_fear_window",
        event_date="2025-04-01",
        event_type="extreme_fear_below_crypto_dma",
        assertions=(
            {
                "type": "eventually_target_asset_greater_than_previous",
                "asset": "btc",
                "within_days": 10,
            },
        ),
    )
    timeline = [
        _point(
            "2025-04-01",
            sentiment_label="neutral",
            macro_label="neutral",
            dma_zone="below",
            btc_current=0.10,
            btc_target=0.10,
        ),
        _point(
            "2025-04-05",
            sentiment_label="neutral",
            macro_label="extreme_fear",
            dma_zone="below",
            btc_current=0.10,
            btc_target=0.20,
        ),
    ]

    result = evaluate_event(event, timeline)

    assert result.passed is True
    assert result.status == "PASS"


def test_extreme_fear_spy_dma_trigger_scans_assertion_window() -> None:
    event = ValidationEvent(
        id="spy_extreme_fear_window",
        event_date="2025-04-01",
        event_type="extreme_fear_below_spy_dma",
        assertions=(
            {
                "type": "eventually_target_asset_greater_than_previous",
                "asset": "spy",
                "within_days": 10,
            },
        ),
    )
    timeline = [
        _point(
            "2025-04-01",
            sentiment_label="neutral",
            macro_label="neutral",
            spy_dma_zone="below",
            spy_current=0.10,
            spy_target=0.10,
        ),
        _point(
            "2025-04-06",
            sentiment_label="neutral",
            macro_label="extreme_fear",
            spy_dma_zone="below",
            spy_current=0.10,
            spy_target=0.20,
        ),
    ]

    result = evaluate_event(event, timeline)

    assert result.passed is True
    assert result.status == "PASS"


def test_extreme_fear_trigger_fails_when_window_has_no_extreme_fear_below_dma() -> None:
    event = ValidationEvent(
        id="extreme_fear_missing_window",
        event_date="2025-04-01",
        event_type="extreme_fear_below_crypto_dma",
        assertions=(
            {
                "type": "eventually_target_asset_greater_than_previous",
                "asset": "btc",
                "within_days": 10,
            },
        ),
    )
    timeline = [
        _point(
            "2025-04-01",
            sentiment_label="neutral",
            macro_label="neutral",
            dma_zone="below",
            btc_current=0.10,
            btc_target=0.10,
        ),
        _point(
            "2025-04-05",
            sentiment_label="fear",
            macro_label="neutral",
            dma_zone="below",
            btc_current=0.10,
            btc_target=0.20,
        ),
    ]

    result = evaluate_event(event, timeline)

    assert result.passed is False
    assert (
        "no extreme_fear (crypto or macro) with DMA below within 10 days"
        in result.failure_message
    )


def _point(
    day: str,
    *,
    sentiment_label: str,
    macro_label: str,
    dma_zone: str = "above",
    spy_dma_zone: str = "above",
    btc_current: float = 0.0,
    btc_target: float = 0.0,
    spy_current: float = 0.0,
    spy_target: float = 0.0,
) -> dict[str, object]:
    return {
        "date": day,
        "market": {
            "sentiment_label": sentiment_label,
            "macro_fear_greed": {"label": macro_label},
        },
        "portfolio": {
            "asset_allocation": {
                "btc": btc_current,
                "eth": 0.0,
                "spy": spy_current,
                "stable": 1.0 - btc_current - spy_current,
            }
        },
        "decision": {
            "target_allocation": {
                "btc": btc_target,
                "eth": 0.0,
                "spy": spy_target,
                "stable": 1.0 - btc_target - spy_target,
            }
        },
        "signal": {
            "details": {
                "dma": {"zone": dma_zone},
                "spy_dma": {"zone": spy_dma_zone},
            }
        },
    }
