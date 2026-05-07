from __future__ import annotations

import json
from pathlib import Path

from src.services.backtesting.validation.event_runner import (
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
