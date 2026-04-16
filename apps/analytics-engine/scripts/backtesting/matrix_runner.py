#!/usr/bin/env python3
"""Run DMA-first compare backtests across a signal matrix and emit diagnostics."""

from __future__ import annotations

import argparse
import copy
import csv
import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from scripts.backtesting.compare_verify import VerificationError, verify
from scripts.backtesting.compare_views import (
    DECISION_COLUMNS,
    EXECUTION_COLUMNS,
    extract_decision_rows,
    extract_execution_rows,
)
from src.services.backtesting.constants import STRATEGY_DCA_CLASSIC
from src.services.backtesting.public_params import (
    get_default_public_params,
    normalize_nested_public_params,
    runtime_params_to_public_params,
    supports_nested_public_params,
)
from src.services.backtesting.strategy_registry import get_strategy_recipe

DEFAULT_ENDPOINT = "http://localhost:8001/api/v3/backtesting/compare"
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parents[1] / "out" / "backtesting"
DEFAULT_SIGNAL_MATRIX: tuple[str, ...] = ("dma_gated_fgi",)


def _default_base_strategy_config() -> dict[str, Any]:
    recipe = get_strategy_recipe("dma_gated_fgi")
    return {
        "config_id": "dma_gated_fgi_default",
        "strategy_id": recipe.strategy_id,
        "params": get_default_public_params(recipe.strategy_id),
    }


DEFAULT_BASE_STRATEGY_CONFIG: dict[str, Any] = _default_base_strategy_config()


@dataclass(frozen=True)
class StrategyReport:
    strategy_id: str
    signal_id: str
    decision_rows: list[dict[str, str]]
    execution_rows: list[dict[str, str]]
    verification_error: str | None
    decision_path: Path
    execution_path: Path


def _utc_timestamp() -> str:
    return datetime.now(UTC).strftime("%Y%m%d_%H%M%S")


def _safe_name(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", name)


def _read_json_source(value: str) -> Any:
    path = Path(value)
    if path.exists():
        return json.loads(path.read_text())
    return json.loads(value)


def _require_mapping(value: Any, *, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object.")
    return value


def _coerce_strategy_id(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("strategy_id must be a non-empty string.")
    return get_strategy_recipe(value).strategy_id


def _default_strategy_params(strategy_id: str) -> dict[str, Any]:
    if supports_nested_public_params(strategy_id):
        return copy.deepcopy(get_default_public_params(strategy_id))
    recipe = get_strategy_recipe(strategy_id)
    return recipe.normalize_public_params({})


def _normalize_script_strategy_params(
    strategy_id: str,
    params: dict[str, Any],
) -> dict[str, Any]:
    recipe = get_strategy_recipe(strategy_id)
    if not supports_nested_public_params(strategy_id):
        return recipe.normalize_public_params(dict(params))
    try:
        return normalize_nested_public_params(strategy_id, params)
    except ValueError:
        runtime_params = recipe.normalize_public_params(dict(params))
        return runtime_params_to_public_params(strategy_id, runtime_params)


def _normalize_base_strategy_config(payload: dict[str, Any]) -> dict[str, Any]:
    required = {"config_id", "strategy_id", "params"}
    if required.issubset(payload.keys()):
        strategy_id = _coerce_strategy_id(payload.get("strategy_id"))
        params = _require_mapping(payload.get("params"), label="base_strategy.params")
        return {
            "config_id": str(payload["config_id"]),
            "strategy_id": strategy_id,
            "params": _normalize_script_strategy_params(strategy_id, params),
        }

    configs = payload.get("configs")
    if isinstance(configs, list) and configs:
        picked = next(
            (
                cfg
                for cfg in configs
                if isinstance(cfg, dict)
                and cfg.get("strategy_id") != STRATEGY_DCA_CLASSIC
            ),
            configs[0],
        )
        if not isinstance(picked, dict):
            raise ValueError("Invalid config entry in strategy-base-config source.")
        return _normalize_base_strategy_config(picked)

    raise ValueError("strategy-base-config must decode to a strategy config object.")


def load_strategy_base_config(source: str | None) -> dict[str, Any]:
    if source is None:
        return copy.deepcopy(DEFAULT_BASE_STRATEGY_CONFIG)
    raw = _read_json_source(source)
    if not isinstance(raw, dict):
        raise ValueError("strategy-base-config must decode to an object.")
    return _normalize_base_strategy_config(raw)


def build_signal_matrix_configs(
    base_strategy_config: dict[str, Any],
    *,
    signals: tuple[str, ...] = DEFAULT_SIGNAL_MATRIX,
) -> list[dict[str, Any]]:
    base_strategy_id = _coerce_strategy_id(base_strategy_config.get("strategy_id"))
    params = _normalize_script_strategy_params(
        base_strategy_id,
        _require_mapping(
            base_strategy_config.get("params"), label="base_strategy.params"
        ),
    )
    base_config_id = str(
        base_strategy_config.get("config_id") or f"{base_strategy_id}_default"
    )
    configs: list[dict[str, Any]] = []
    for strategy_id in signals:
        recipe = get_strategy_recipe(_coerce_strategy_id(strategy_id))
        strategy_params = (
            copy.deepcopy(params)
            if recipe.strategy_id == base_strategy_id
            else _default_strategy_params(recipe.strategy_id)
        )
        config_id = (
            base_config_id
            if recipe.strategy_id == base_strategy_id
            else f"{base_config_id}__{recipe.strategy_id}"
        )
        configs.append(
            {
                "config_id": config_id,
                "strategy_id": recipe.strategy_id,
                "params": strategy_params,
            }
        )
    return configs


def build_request_payload(
    *,
    total_capital: float,
    days: int,
    matrix_configs: list[dict[str, Any]],
    include_dca_classic: bool,
) -> dict[str, Any]:
    configs: list[dict[str, Any]] = []
    if include_dca_classic:
        configs.append(
            {"config_id": "dca_classic", "strategy_id": "dca_classic", "params": {}}
        )
    configs.extend(matrix_configs)
    return {
        "total_capital": float(total_capital),
        "configs": configs,
        "days": int(days),
    }


def fetch_compare_result(
    *, endpoint: str, payload: dict[str, Any], timeout_seconds: int = 180
) -> dict[str, Any]:
    request_data = json.dumps(payload).encode("utf-8")
    request = Request(
        endpoint,
        data=request_data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout_seconds) as response:  # noqa: S310
            body = response.read().decode("utf-8")
    except HTTPError as exc:  # pragma: no cover
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"HTTP {exc.code} from compare endpoint: {body[:500]}"
        ) from exc
    except URLError as exc:  # pragma: no cover
        raise RuntimeError(f"Failed to reach compare endpoint: {exc}") from exc

    parsed = json.loads(body)
    if not isinstance(parsed, dict):
        raise RuntimeError("Compare endpoint JSON root must be an object.")
    return parsed


def _write_csv(
    path: Path, rows: list[dict[str, str]], columns: tuple[str, ...]
) -> None:
    with path.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(columns))
        writer.writeheader()
        writer.writerows(rows)


def _signal_id_for_config(config: dict[str, Any]) -> str:
    return _coerce_strategy_id(config.get("strategy_id"))


def _write_summary(
    *,
    path: Path,
    reports: list[StrategyReport],
    payload: dict[str, Any],
    result: dict[str, Any],
) -> None:
    lines = [
        "# DMA-First Backtest Matrix",
        "",
        f"- total_capital: {payload['total_capital']}",
        f"- days: {payload['days']}",
        "",
        "## Strategies",
    ]
    strategies = _require_mapping(result.get("strategies"), label="response.strategies")
    for report in reports:
        summary = _require_mapping(
            strategies.get(report.strategy_id),
            label=f"strategies[{report.strategy_id}]",
        )
        lines.extend(
            [
                f"### {report.strategy_id}",
                f"- signal_id: {report.signal_id}",
                f"- trade_count: {summary.get('trade_count', 0)}",
                f"- decision_rows: {len(report.decision_rows)}",
                f"- execution_rows: {len(report.execution_rows)}",
                f"- verify: {'PASS' if report.verification_error is None else 'FAIL'}",
            ]
        )
        if report.verification_error is not None:
            lines.append(f"- verify_error: {report.verification_error}")
        lines.append("")
    path.write_text("\n".join(lines).strip() + "\n")


def run_matrix(
    *,
    endpoint: str = DEFAULT_ENDPOINT,
    days: int = 500,
    total_capital: float = 10_000.0,
    output_dir: Path = DEFAULT_OUTPUT_DIR,
    strict_verify: bool = True,
    strategy_base_config_source: str | None = None,
    include_dca_classic: bool = True,
) -> int:
    output_dir.mkdir(parents=True, exist_ok=True)
    base_strategy = load_strategy_base_config(strategy_base_config_source)
    matrix_configs = build_signal_matrix_configs(base_strategy)
    payload = build_request_payload(
        total_capital=total_capital,
        days=days,
        matrix_configs=matrix_configs,
        include_dca_classic=include_dca_classic,
    )
    result = fetch_compare_result(endpoint=endpoint, payload=payload)

    timestamp = _utc_timestamp()
    raw_path = output_dir / f"raw_{timestamp}.json"
    raw_latest = output_dir / "raw_latest.json"
    raw_path.write_text(json.dumps(result, indent=2, sort_keys=True))
    raw_latest.write_text(raw_path.read_text())

    timeline = result.get("timeline")
    if not isinstance(timeline, list):
        raise RuntimeError("Compare result is missing timeline[].")

    reports: list[StrategyReport] = []
    raw_temp_path = raw_path
    for config in matrix_configs:
        strategy_id = str(config["config_id"])
        signal_id = _signal_id_for_config(config)
        decision_rows = extract_decision_rows(timeline, strategy_id)
        execution_rows = extract_execution_rows(timeline, strategy_id)
        decision_path = output_dir / f"decision_{_safe_name(strategy_id)}.csv"
        execution_path = output_dir / f"execution_{_safe_name(strategy_id)}.csv"
        _write_csv(decision_path, decision_rows, DECISION_COLUMNS)
        _write_csv(execution_path, execution_rows, EXECUTION_COLUMNS)

        verification_error: str | None = None
        if signal_id == "dma_gated_fgi":
            try:
                verify(str(raw_temp_path), strategy_id=strategy_id)
            except VerificationError as exc:
                verification_error = str(exc)

        reports.append(
            StrategyReport(
                strategy_id=strategy_id,
                signal_id=signal_id,
                decision_rows=decision_rows,
                execution_rows=execution_rows,
                verification_error=verification_error,
                decision_path=decision_path,
                execution_path=execution_path,
            )
        )

    summary_path = output_dir / f"summary_{timestamp}.md"
    summary_latest = output_dir / "summary_latest.md"
    _write_summary(path=summary_path, reports=reports, payload=payload, result=result)
    summary_latest.write_text(summary_path.read_text())

    if strict_verify and any(
        report.verification_error
        for report in reports
        if report.signal_id == "dma_gated_fgi"
    ):
        return 1
    return 0


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--days", type=int, default=500)
    parser.add_argument("--total-capital", type=float, default=10_000.0)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--strategy-base-config", dest="strategy_base_config_source")
    parser.add_argument(
        "--no-strict-verify", dest="strict_verify", action="store_false"
    )
    parser.add_argument(
        "--no-dca-classic", dest="include_dca_classic", action="store_false"
    )
    parser.set_defaults(strict_verify=True, include_dca_classic=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_arg_parser()
    args = parser.parse_args(argv)
    return run_matrix(
        endpoint=args.endpoint,
        days=args.days,
        total_capital=args.total_capital,
        output_dir=args.output_dir,
        strict_verify=args.strict_verify,
        strategy_base_config_source=args.strategy_base_config_source,
        include_dca_classic=args.include_dca_classic,
    )


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = [
    "DEFAULT_BASE_STRATEGY_CONFIG",
    "DEFAULT_ENDPOINT",
    "DEFAULT_OUTPUT_DIR",
    "DEFAULT_SIGNAL_MATRIX",
    "StrategyReport",
    "build_request_payload",
    "build_signal_matrix_configs",
    "fetch_compare_result",
    "load_strategy_base_config",
    "main",
    "run_matrix",
    "verify",
]
