"""Helpers for resolving execution block reasons."""

from __future__ import annotations


def resolve_effective_block_reason(
    *,
    blocked_reason: str | None,
    diagnostics: object,
) -> str | None:
    if isinstance(blocked_reason, str) and blocked_reason:
        return blocked_reason

    return find_nested_block_reason(diagnostics)


def find_nested_block_reason(value: object) -> str | None:
    if not isinstance(value, dict):
        return None

    for key, nested_value in value.items():
        if key in {"blocked_reason", "block_reason"}:
            if isinstance(nested_value, str) and nested_value:
                return nested_value
            continue

        nested_block_reason = find_nested_block_reason(nested_value)
        if nested_block_reason is not None:
            return nested_block_reason

    return None
