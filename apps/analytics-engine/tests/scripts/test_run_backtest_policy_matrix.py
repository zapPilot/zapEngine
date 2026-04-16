"""Tests for the DMA-first matrix runner script."""

from __future__ import annotations

import inspect
import json
from pathlib import Path
from typing import Any

import scripts.backtesting.matrix_runner as matrix
from scripts.backtesting.compare_verify import VerificationError


def _strategy_state(
    *,
    signal_id: str,
    action: str,
    reason: str,
    rule_group: str,
    event: str | None,
    spot_pct: float,
    stable_pct: float,
    cross_event: str | None = None,
    buy_gate: dict[str, Any] | None = None,
) -> dict[str, Any]:
    total = 10_000.0
    return {
        "portfolio": {
            "spot_usd": total * spot_pct,
            "stable_usd": total * stable_pct,
            "total_value": total,
            "allocation": {"spot": spot_pct, "stable": stable_pct},
        },
        "signal": {
            "signal_id": signal_id,
            "regime": "extreme_fear" if action == "buy" else "greed",
            "raw_value": 10.0 if action == "buy" else 72.0,
            "confidence": 1.0,
            "ath_event": None,
            "dma": {
                "dma_200": 100000.0,
                "distance": -0.15 if action == "buy" else 0.05,
                "zone": "below" if action == "buy" else "above",
                "cross_event": cross_event,
            },
        },
        "decision": {
            "action": action,
            "reason": reason,
            "rule_group": rule_group,
            "target_allocation": {
                "spot": 1.0 if action == "buy" else 0.0,
                "stable": 0.0 if action == "buy" else 1.0,
            },
            "immediate": cross_event is not None,
        },
        "execution": {
            "event": event,
            "transfers": [],
            "blocked_reason": buy_gate.get("block_reason")
            if isinstance(buy_gate, dict)
            else None,
            "step_count": 5,
            "steps_remaining": 4,
            "interval_days": 2,
            "buy_gate": buy_gate,
        },
    }


def _response_payload() -> dict[str, Any]:
    return {
        "strategies": {
            "dca_classic": {
                "strategy_id": "dca_classic",
                "display_name": "dca_classic",
                "signal_id": None,
                "total_invested": 10000.0,
                "final_value": 10100.0,
                "roi_percent": 1.0,
                "trade_count": 10,
                "final_allocation": {"spot": 0.5, "stable": 0.5},
                "parameters": {},
            },
            "dma_gated_fgi_default": {
                "strategy_id": "dma_gated_fgi",
                "display_name": "dma_gated_fgi_default",
                "signal_id": "dma_gated_fgi",
                "total_invested": 10000.0,
                "final_value": 10200.0,
                "roi_percent": 2.0,
                "trade_count": 4,
                "final_allocation": {"spot": 0.0, "stable": 1.0},
                "parameters": {},
            },
        },
        "timeline": [
            {
                "market": {
                    "date": "2025-01-01",
                    "token_price": {"btc": 100000.0},
                    "sentiment": 72,
                    "sentiment_label": "greed",
                },
                "strategies": {
                    "dca_classic": _strategy_state(
                        signal_id="dma_gated_fgi",
                        action="hold",
                        reason="dca_step",
                        rule_group="none",
                        event="rebalance",
                        spot_pct=0.5,
                        stable_pct=0.5,
                    ),
                    "dma_gated_fgi_default": _strategy_state(
                        signal_id="dma_gated_fgi",
                        action="sell",
                        reason="dma_cross_down",
                        rule_group="cross",
                        event="rebalance",
                        spot_pct=0.0,
                        stable_pct=1.0,
                        cross_event="cross_down",
                    ),
                },
            },
            {
                "market": {
                    "date": "2025-01-02",
                    "token_price": {"btc": 90000.0},
                    "sentiment": 10,
                    "sentiment_label": "extreme_fear",
                },
                "strategies": {
                    "dca_classic": _strategy_state(
                        signal_id="dma_gated_fgi",
                        action="hold",
                        reason="dca_step",
                        rule_group="none",
                        event="rebalance",
                        spot_pct=0.5,
                        stable_pct=0.5,
                    ),
                    "dma_gated_fgi_default": _strategy_state(
                        signal_id="dma_gated_fgi",
                        action="buy",
                        reason="below_extreme_fear_buy",
                        rule_group="dma_fgi",
                        event=None,
                        spot_pct=0.0,
                        stable_pct=1.0,
                        buy_gate={
                            "buy_strength": 0.4,
                            "sideways_confirmed": False,
                            "window_days": 5,
                            "range_value": 0.06,
                            "leg_index": None,
                            "leg_cap_pct": None,
                            "leg_cap_usd": None,
                            "leg_spent_usd": 0.0,
                            "episode_state": "idle",
                            "block_reason": "sideways_not_confirmed",
                        },
                    ),
                },
            },
        ],
    }


def test_build_signal_matrix_configs_has_single_signal_variant() -> None:
    configs = matrix.build_signal_matrix_configs(matrix.DEFAULT_BASE_STRATEGY_CONFIG)
    assert [cfg["config_id"] for cfg in configs] == ["dma_gated_fgi_default"]
    assert [cfg["strategy_id"] for cfg in configs] == ["dma_gated_fgi"]
    assert configs[0]["params"]["signal"]["cross_cooldown_days"] == 30


def test_default_output_dir_uses_backtesting_subdir() -> None:
    assert matrix.DEFAULT_OUTPUT_DIR.parts[-2:] == ("out", "backtesting")


def test_load_strategy_base_config_canonicalizes_legacy_flat_builtin_params() -> None:
    loaded = matrix.load_strategy_base_config(
        json.dumps(
            {
                "config_id": "dma_gated_fgi_default",
                "strategy_id": "dma_gated_fgi",
                "params": {
                    "cross_cooldown_days": 12,
                    "cross_on_touch": False,
                },
            }
        )
    )

    assert loaded["strategy_id"] == "dma_gated_fgi"
    assert loaded["params"]["signal"]["cross_cooldown_days"] == 12
    assert loaded["params"]["signal"]["cross_on_touch"] is False


def test_run_matrix_returns_nonzero_when_strict_verify_fails(
    monkeypatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(matrix, "_utc_timestamp", lambda: "20260308_120000")
    monkeypatch.setattr(matrix, "fetch_compare_result", lambda **_: _response_payload())

    def _fake_verify(path: str, strategy_id: str | None = None, **_: Any) -> object:
        _ = path
        if strategy_id == "dma_gated_fgi_default":
            raise VerificationError("forced verify failure")
        return object()

    monkeypatch.setattr(matrix, "verify", _fake_verify)
    exit_code = matrix.run_matrix(output_dir=tmp_path, strict_verify=True)
    assert exit_code == 1
    summary = (tmp_path / "summary_20260308_120000.md").read_text()
    assert "forced verify failure" in summary


def test_run_matrix_writes_raw_summary_and_per_strategy_csvs(
    monkeypatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(matrix, "_utc_timestamp", lambda: "20260308_130000")
    monkeypatch.setattr(matrix, "fetch_compare_result", lambda **_: _response_payload())
    monkeypatch.setattr(matrix, "verify", lambda *_, **__: object())

    exit_code = matrix.run_matrix(output_dir=tmp_path, strict_verify=True)
    assert exit_code == 0
    assert (tmp_path / "raw_20260308_130000.json").exists()
    assert (tmp_path / "raw_latest.json").exists()
    assert (tmp_path / "summary_20260308_130000.md").exists()
    assert (tmp_path / "summary_latest.md").exists()
    decision_files = sorted(tmp_path.glob("decision_*.csv"))
    execution_files = sorted(tmp_path.glob("execution_*.csv"))
    assert len(decision_files) == 1
    assert len(execution_files) == 1
    assert "DATE" in decision_files[0].read_text().splitlines()[0]
    execution_csv = (tmp_path / "execution_dma_gated_fgi_default.csv").read_text()
    assert "BUY_GATE" in execution_csv.splitlines()[0]
    assert "LEG_CAP_USD" in execution_csv.splitlines()[0]
    assert "sideways_not_confirmed" in execution_csv


def test_matrix_runner_no_longer_imports_deleted_top_level_debug_scripts() -> None:
    source = inspect.getsource(matrix)
    assert "scripts.debug_backtest_decisions" not in source
    assert "scripts.debug_dma_execution" not in source
    assert "scripts.verify_cross_dma" not in source
