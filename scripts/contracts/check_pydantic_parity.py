#!/usr/bin/env python3
"""Compare normalized Pydantic JSON Schemas with Zod contract snapshots."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, TypeAlias

Json: TypeAlias = dict[str, Any] | list[Any] | str | int | float | bool | None

ROOT = Path(__file__).resolve().parents[2]
ANALYTICS_ROOT = ROOT / "apps" / "analytics-engine"
SNAPSHOT_DIR = ROOT / "scripts" / "contracts" / "snapshots"

sys.path.insert(0, str(ANALYTICS_ROOT))

from src.models.backtesting import (  # noqa: E402
    Allocation,
    AssetAllocation,
    BacktestCompareRequestV3,
    BacktestResponse,
    BacktestStrategyCatalogResponseV3,
    TransferRecord,
)
from src.models.market_dashboard import MarketDashboardResponse  # noqa: E402
from src.models.strategy import DailySuggestionResponse  # noqa: E402
from src.models.strategy_config import (  # noqa: E402
    StrategyConfigsResponse,
    StrategyPreset,
)

PYDANTIC_MODELS = {
    "asset_allocation": AssetAllocation,
    "backtest_request": BacktestCompareRequestV3,
    "backtest_response": BacktestResponse,
    "backtest_strategy_catalog_response": BacktestStrategyCatalogResponseV3,
    "bucket_transfer": TransferRecord,
    "daily_suggestion_response": DailySuggestionResponse,
    "market_dashboard_response": MarketDashboardResponse,
    "portfolio_allocation": Allocation,
    "strategy_configs_response": StrategyConfigsResponse,
    "strategy_preset": StrategyPreset,
}

IGNORED_KEYS = {
    "$schema",
    "default",
    "example",
    "examples",
    "format",
    "maxItems",
    "minItems",
    "propertyNames",
    "readOnly",
    "required",
    "title",
}


def _normalize_nullable(schema: dict[str, Any]) -> dict[str, Any]:
    variants = schema.get("anyOf")
    if not isinstance(variants, list):
        return schema

    non_null = [
        variant
        for variant in variants
        if not (isinstance(variant, dict) and variant.get("type") == "null")
    ]
    has_null = len(non_null) != len(variants)
    if not has_null or len(non_null) != 1 or not isinstance(non_null[0], dict):
        return schema

    replacement = dict(non_null[0])
    replacement["nullable"] = True
    for key, value in schema.items():
        if key != "anyOf":
            replacement.setdefault(key, value)
    return replacement


def _ref_name(ref: str) -> str:
    return ref.rsplit("/", 1)[-1]


def _is_json_value_schema(schema: dict[str, Any]) -> bool:
    if schema == {}:
        return True

    variants = schema.get("anyOf")
    if not isinstance(variants, list):
        return False

    variant_types: set[str] = set()
    for variant in variants:
        if not isinstance(variant, dict):
            continue
        variant_type = variant.get("type")
        if isinstance(variant_type, str):
            variant_types.add(variant_type)

    return {"array", "boolean", "null", "number", "object", "string"}.issubset(
        variant_types
    )


def _is_json_value_additional_properties(
    value: Any,
    defs: dict[str, Any],
) -> bool:
    if not isinstance(value, dict):
        return False
    if value == {}:
        return True
    if "$ref" in value and isinstance(value["$ref"], str):
        resolved = defs.get(_ref_name(value["$ref"]), {})
        if isinstance(resolved, dict):
            return _is_json_value_schema(resolved)
    return _is_json_value_schema(value)


def _normalize(value: Json, defs: dict[str, Any] | None = None) -> Json:
    defs = defs or {}

    if isinstance(value, list):
        normalized = [_normalize(entry, defs) for entry in value]
        if all(isinstance(entry, str) for entry in normalized):
            return sorted(normalized)
        if all(isinstance(entry, dict) for entry in normalized):
            return sorted(
                normalized,
                key=lambda entry: json.dumps(entry, sort_keys=True),
            )
        return normalized

    if not isinstance(value, dict):
        return value

    value = _normalize_nullable(value)

    if "$ref" in value and isinstance(value["$ref"], str):
        resolved = defs.get(_ref_name(value["$ref"]), {})
        merged = {
            **resolved,
            **{key: entry for key, entry in value.items() if key != "$ref"},
        }
        return _normalize(merged, defs)

    if _is_json_value_schema(value):
        return {}

    normalized: dict[str, Json] = {}
    for key, entry in value.items():
        if key == "$defs":
            continue
        if key in IGNORED_KEYS:
            continue
        if key == "description" and isinstance(entry, str):
            continue
        if key == "additionalProperties" and entry is False:
            continue
        if key in {"maximum", "minimum"} and abs(float(entry)) == 9007199254740991:
            continue
        if (
            key == "properties"
            and _is_json_value_additional_properties(
                value.get("additionalProperties"),
                defs,
            )
        ):
            continue
        normalized[key] = _normalize(entry, defs)

    return normalized


def _normalize_schema(schema: Json) -> Json:
    defs = schema.get("$defs", {}) if isinstance(schema, dict) else {}
    return _normalize(schema, defs if isinstance(defs, dict) else {})


def _read_snapshot(name: str) -> Json:
    snapshot_path = SNAPSHOT_DIR / f"{name}.json"
    if not snapshot_path.exists():
        raise FileNotFoundError(f"Missing Zod snapshot: {snapshot_path}")
    return json.loads(snapshot_path.read_text(encoding="utf-8"))


def _model_schema(model: type[Any]) -> Json:
    return model.model_json_schema(mode="serialization")


def _print_diff(name: str, expected: Json, actual: Json) -> None:
    print(f"Contract parity failed for {name}", file=sys.stderr)
    print("--- zod snapshot", file=sys.stderr)
    print(json.dumps(expected, indent=2, sort_keys=True), file=sys.stderr)
    print("--- pydantic schema", file=sys.stderr)
    print(json.dumps(actual, indent=2, sort_keys=True), file=sys.stderr)


def main() -> int:
    failures = 0

    for name, model in PYDANTIC_MODELS.items():
        zod_schema = _normalize_schema(_read_snapshot(name))
        pydantic_schema = _normalize_schema(_model_schema(model))

        if zod_schema != pydantic_schema:
            failures += 1
            _print_diff(name, zod_schema, pydantic_schema)

    if failures:
        print(f"{failures} contract parity check(s) failed.", file=sys.stderr)
        return 1

    print("Contract parity checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
