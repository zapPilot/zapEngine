from __future__ import annotations

import subprocess
from datetime import date
from typing import Any

import pytest

from src.services.backtesting.lab import report as report_module
from src.services.backtesting.lab.report import (
    SUMMARY_MAX_LINES,
    build_report,
    canonical_json,
    git_state,
    hash_of,
    normalize,
    summary_lines,
)


def _body(**overrides: Any) -> dict[str, Any]:
    strategy = {
        "roi_percent": 12.345,
        "max_drawdown_percent": -5.5,
        "sharpe_ratio": 1.1,
        "trade_count": 7,
        "pnl_share_of_capital": {"price": 10.0, "yield": 2.0, "cost": -1.0},
    }
    body = {
        "fingerprint": {
            "spec": {"ref": "dma_fgi@1#abc"},
            "bundle": {"ref": "prod:2026-01-01-x"},
        },
        "window": {"start": "2025-01-01", "end": "2025-12-31", "days": 365},
        "assumptions": {"fill_lag_days": 1, "slippage_rate": 0.003, "stable_apr": 0.03},
        "total_capital": 10_000.0,
        "strategies": {
            "strategy": strategy,
            "dca_classic": {**strategy, "roi_percent": -3.0},
        },
        "comparisons": {"dca_classic": {"roi_pp": 15.3}},
        "invariants": [{"name": "weights_valid", "count": 0}],
        "attribution": {
            "rules": {"exit": {"trades": 2}},
            "leave_one_out": {"rule:exit": {"roi_pp": 4.2}},
        },
        "warnings": ["careful"],
    }
    body.update(overrides)
    return body


def test_floats_are_rounded_and_dates_become_text() -> None:
    assert normalize(
        {"a": 1.23456789, "b": date(2025, 1, 2), "c": (1, 2.5), "d": -1e-9}
    ) == {"a": 1.234568, "b": "2025-01-02", "c": [1, 2.5], "d": 0.0}


def test_plain_values_pass_through() -> None:
    assert normalize({"a": None, "b": True, "c": "x", "d": 3}) == {
        "a": None,
        "b": True,
        "c": "x",
        "d": 3,
    }


def test_a_value_that_is_not_json_is_refused() -> None:
    with pytest.raises(TypeError, match="set cannot go in a report"):
        normalize({"a": {1}})


def test_the_hash_ignores_key_order_and_float_noise() -> None:
    first = build_report({"b": 1.0000000001, "a": 2})
    second = build_report({"a": 2, "b": 1.0})

    assert first.report_hash == second.report_hash
    assert first.report_hash.startswith("sha256:")


def test_a_different_number_is_a_different_report() -> None:
    assert build_report({"a": 1}).report_hash != build_report({"a": 2}).report_hash


def test_the_canonical_form_is_compact_and_sorted() -> None:
    assert canonical_json({"b": 1, "a": [1, 2]}) == '{"a":[1,2],"b":1}'
    assert hash_of({"a": 1}) == hash_of({"a": 1})


def test_not_a_number_cannot_be_hashed() -> None:
    with pytest.raises(ValueError):
        canonical_json({"a": float("nan")})


def test_a_report_carries_its_own_hash() -> None:
    report = build_report({"a": 1})

    assert report.as_dict() == {"a": 1, "report_hash": report.report_hash}


def test_the_code_revision_comes_from_git(monkeypatch: pytest.MonkeyPatch) -> None:
    answers = {"rev-parse": "abc123\n", "status": " M file.py\n"}

    def fake_run(command: list[str], **_: Any) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(command, 0, stdout=answers[command[1]])

    monkeypatch.setattr(report_module.subprocess, "run", fake_run)

    assert git_state() == {"sha": "abc123", "dirty": True}
    answers["status"] = ""
    assert git_state() == {"sha": "abc123", "dirty": False}


def test_outside_a_checkout_the_revision_is_unknown(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def broken(*_: Any, **__: Any) -> None:
        raise FileNotFoundError("git")

    monkeypatch.setattr(report_module.subprocess, "run", broken)

    assert git_state() == {"sha": None, "dirty": None}


def test_the_summary_reads_in_a_few_lines() -> None:
    lines = summary_lines(_body(), "sha256:abc")

    assert (
        lines[0]
        == "dma_fgi@1#abc on prod:2026-01-01-x | 2025-01-01..2025-12-31 (365 days)"
    )
    assert "fill lag 1d, slippage 0.30%, stable 3.00% APR, capital $10,000" in lines[1]
    assert any(line.startswith("strategy") and "12.35" in line for line in lines)
    assert any(line.startswith("dca_classic") for line in lines)
    assert "pnl split (% of capital): price +10.0, yield +2.0, cost -1.0" in lines
    assert "ROI lead (pp): dca_classic +15.3" in lines
    assert "invariants (days): weights_valid 0" in lines
    assert "rule trades: exit 2" in lines
    assert "ROI the strategy loses without (pp): rule:exit +4.2" in lines
    assert "warnings: careful" in lines
    assert lines[-1] == "report sha256:abc"
    assert len(lines) <= SUMMARY_MAX_LINES


def test_a_summary_without_optional_parts_is_shorter() -> None:
    body = _body(
        comparisons={},
        warnings=[],
        attribution={"rules": {}, "leave_one_out": {}},
    )

    lines = summary_lines(body, "sha256:abc")

    assert "rule trades: none" in lines
    assert not any(
        line.startswith(("ROI lead", "warnings", "ROI the")) for line in lines
    )


def test_the_summary_never_exceeds_its_limit_and_keeps_the_hash() -> None:
    many = {f"bench{i}": _body()["strategies"]["strategy"] for i in range(20)}
    body = _body(strategies={"strategy": _body()["strategies"]["strategy"], **many})

    lines = summary_lines(body, "sha256:abc")

    assert len(lines) == SUMMARY_MAX_LINES
    assert lines[-1] == "report sha256:abc"
