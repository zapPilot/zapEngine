from __future__ import annotations

import copy
from datetime import date
from typing import Any

from src.services.backtesting.lab.diff import spec_diff
from src.services.backtesting.lab.policy import load_policy
from src.services.backtesting.lab.promotion import (
    FAIL,
    INSUFFICIENT,
    PASS,
    PROMOTABLE,
    Gate,
    verdict,
)
from src.services.backtesting.lab.promotion_record import (
    RECORD_FORMAT,
    build_record,
    log_entry,
)
from src.services.backtesting.spec import load_spec, parse_spec
from tests.services.backtesting.spec.helpers import reference_raw

TODAY = date(2026, 10, 10)
BUNDLE = {"ref": "prod:2026-10-01-abc", "content_sha256": "c" * 64, "source": "prod"}
COMPARISON = {
    "base": {"sharpe_ratio": 1.0, "trade_count": 60},
    "candidate": {"sharpe_ratio": 1.25, "trade_count": 52},
    "roi_pp": 3.5,
    "max_drawdown_pp": 2.25,
    "days": 500,
}


def _candidate(**changes: Any):
    raw = reference_raw()
    raw["id"] = "guarded"
    raw["description"] = "The reference with a force-exit trend guard."
    raw["overlays"] = [
        {
            "kind": "trend_guard",
            "id": "trend_guard",
            "mode": "force_exit",
            "below_dma_buffer": 0.02,
            "confirm_days": 2,
        }
    ]
    raw.update(changes)
    return parse_spec(raw)


def _gates(*statuses: str) -> list[Gate]:
    return [
        Gate("walk_forward", f"gate_{index}", status, f"detail {index}")
        for index, status in enumerate(statuses)
    ]


def _record(
    gates: list[Gate],
    *,
    bundle: dict[str, Any] | None = None,
    candidate=None,
    **overrides: Any,
) -> dict[str, Any]:
    reference = load_spec("reference/dma_fgi")
    candidate = candidate or _candidate()
    fields: dict[str, Any] = {
        "candidate": candidate,
        "reference": reference,
        "policy": load_policy(),
        "changes": spec_diff(reference, candidate),
        "bundle": bundle or BUNDLE,
        "sweep": {"sweep_id": "s1", "status": "ok"},
        "look": {"lineage": "lin", "window": {"days": 120}},
        "comparison": COMPARISON,
        "ledger_candidates": 7,
        "gates": gates,
        "verdict": verdict(gates),
        "git": {"sha": "abc", "dirty": False},
    }
    fields.update(overrides)
    return build_record(**fields)


def test_a_record_holds_the_whole_decision() -> None:
    record = _record(_gates(PASS, PASS))

    assert record["record_format"] == RECORD_FORMAT
    assert record["verdict"] == PROMOTABLE
    assert record["candidate"]["ref"].startswith("guarded@1#")
    assert record["reference"]["ref"] == "dma_fgi@1#a22bccfabb4b"
    assert record["policy"]["hash"] == load_policy().policy_hash
    assert record["evidence"] == {
        "bundle": BUNDLE,
        "sweep": {"sweep_id": "s1", "status": "ok"},
        "holdout": {"lineage": "lin", "window": {"days": 120}},
    }
    assert record["ledger"] == {"distinct_candidates": 7}
    assert [gate["name"] for gate in record["gates"]] == ["gate_0", "gate_1"]
    assert record["git"] == {"sha": "abc", "dirty": False}
    assert {change["pointer"] for change in record["changes"]} >= {
        "/overlays[trend_guard]"
    }


def test_a_record_with_no_sweep_or_look_says_so() -> None:
    record = _record(_gates(INSUFFICIENT), sweep=None, look=None)

    assert record["evidence"]["sweep"] is None
    assert record["evidence"]["holdout"] is None


def test_the_id_follows_the_decision_and_nothing_else() -> None:
    gates = _gates(PASS, PASS)

    assert (
        _record(gates)["promotion_id"] == _record(copy.deepcopy(gates))["promotion_id"]
    )
    assert len(_record(gates)["promotion_id"]) == 16
    assert _record(gates)["promotion_id"] != _record(_gates(PASS, FAIL))["promotion_id"]
    assert (
        _record(gates)["promotion_id"]
        != _record(gates, ledger_candidates=8)["promotion_id"]
    )


def test_a_promotable_entry_says_what_to_do_with_the_reference() -> None:
    text = log_entry(_record(_gates(PASS, PASS)), today=TODAY)

    assert text.startswith("### 2026-10-10 - Promotion of guarded@1#")
    assert ": promotable\n" in text
    assert "- **Status**: active" in text
    assert "- **Commit**: pending local change (`promote guarded@1#" in text
    assert "ROI +3.50 pp, MaxDD +2.25 pp, Sharpe +0.25, trades 60 -> 52" in text
    assert "versus dma_fgi@1#a22bccfabb4b on prod:2026-10-01-abc (500 days)" in text
    assert "2 of 2 gates pass, with 7 distinct candidates tried" in text
    assert "version 2 and run `spec lock`" in text
    assert "Warning" not in text


def test_a_rejected_entry_names_the_gates_it_failed() -> None:
    text = log_entry(_record(_gates(PASS, FAIL, FAIL)), today=TODAY)

    assert ": rejected\n" in text
    assert "- **Status**: rejected" in text
    assert "not promotable (failed: gate_1, gate_2)." in text


def test_an_entry_without_enough_evidence_names_what_is_missing() -> None:
    text = log_entry(_record(_gates(PASS, INSUFFICIENT)), today=TODAY)

    assert "- **Status**: insufficient_evidence" in text
    assert "not promotable (evidence missing: gate_1)." in text


def test_an_entry_names_both_failures_and_missing_evidence() -> None:
    text = log_entry(_record(_gates(FAIL, INSUFFICIENT)), today=TODAY)

    assert "not promotable (failed: gate_0; evidence missing: gate_1)." in text


def test_an_entry_on_synthetic_data_says_it_is_not_a_finding() -> None:
    synthetic = {**BUNDLE, "source": "synthetic"}

    text = log_entry(_record(_gates(PASS), bundle=synthetic), today=TODAY)

    assert "the evidence is synthetic data" in text
    assert "not a finding about real markets" in text


def test_an_entry_lists_a_few_changes_and_counts_the_rest() -> None:
    raw = reference_raw()
    raw["id"] = "tuned"
    for rule in raw["rules"]:
        if rule["kind"] == "dma_overextension_trim":
            rule["cooldown_days"] = 9
            rule["sell_step"] = 0.06
            rule["thresholds"] = {"SPY": 0.11, "BTC": 0.21, "ETH": 0.51}
            rule["fgi_multipliers"]["greed"] = 0.6
    candidate = parse_spec(raw)

    text = log_entry(_record(_gates(PASS), candidate=candidate), today=TODAY)

    assert "6 change(s)" in text
    assert "and 1 more" in text
    assert "`/id`" not in text
