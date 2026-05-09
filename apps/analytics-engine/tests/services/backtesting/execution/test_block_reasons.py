from __future__ import annotations

from src.services.backtesting.execution.block_reasons import (
    find_nested_block_reason,
    resolve_effective_block_reason,
)


def test_find_nested_block_reason_ignores_non_dict_values() -> None:
    assert find_nested_block_reason(None) is None
    assert find_nested_block_reason(["trade_quota_min_interval_active"]) is None


def test_find_nested_block_reason_skips_empty_and_non_string_reason_keys() -> None:
    diagnostics = {
        "blocked_reason": "",
        "plugin": {
            "block_reason": 123,
            "payload": {"blocked_reason": "trade_quota_min_interval_active"},
        },
    }

    assert find_nested_block_reason(diagnostics) == "trade_quota_min_interval_active"


def test_resolve_effective_block_reason_prefers_explicit_reason() -> None:
    assert (
        resolve_effective_block_reason(
            blocked_reason="execution_paused",
            diagnostics={"blocked_reason": "nested_reason"},
        )
        == "execution_paused"
    )


def test_resolve_effective_block_reason_falls_back_to_nested_diagnostics() -> None:
    assert (
        resolve_effective_block_reason(
            blocked_reason=None,
            diagnostics={"execution": {"details": {"block_reason": "buy_gate_closed"}}},
        )
        == "buy_gate_closed"
    )
