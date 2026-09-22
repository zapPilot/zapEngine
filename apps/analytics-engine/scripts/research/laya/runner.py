"""Run the research-only Laya direct-allocation historical comparison."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from statistics import fmean
from typing import Any, cast

from scripts.research.laya.client import (
    CachedLayaClient,
    LayaDecisionClient,
    LayaHubClient,
)
from scripts.research.laya.decoder import ScoreDecoding
from scripts.research.laya.fakes import FakeLayaClient
from scripts.research.laya.questions import ENCODING_VERSION, EncodingId
from scripts.research.laya.strategy import LayaExperimentSpec, resolved_laya_config
from src.core.database import close_database, init_database, session_scope
from src.models.backtesting import (
    BacktestCompareConfigV3,
    BacktestCompareRequestV3,
    BacktestResponse,
)
from src.services.backtesting.composition import ResolvedSavedStrategyConfig
from src.services.backtesting.execution.compare import run_compare_v3_on_data
from src.services.backtesting.strategy_registry import get_strategy_recipe
from src.services.dependencies import build_backtesting_service

APP_ROOT = Path(__file__).resolve().parents[3]
SNAPSHOT_PATH = APP_ROOT / "tests/fixtures/strategy_performance_snapshot_500d.json"
DEFAULT_REPORT_DIR = APP_ROOT / "reports/laya"
DEFAULT_CACHE_PATH = DEFAULT_REPORT_DIR / "cache/laya_direct_allocation.jsonl"
BASELINE_IDS = ("dma_fgi_portfolio_rules", "dca_classic")
DEFAULT_ENCODINGS: tuple[EncodingId, ...] = (
    "per_bucket_score",
    "posture_mixture",
    "static_equal_weight",
)
CHECKPOINTS = {
    "english": "convaiinnovations/laya",
    "typed-decisions": "convaiinnovations/laya-typed-decisions",
}


@dataclass(frozen=True)
class ReferenceWindow:
    start_date: date
    end_date: date
    days: int


def _snapshot() -> dict[str, Any]:
    payload = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Strategy snapshot must be a JSON object")
    return cast(dict[str, Any], payload)


def default_reference_date() -> date:
    return date.fromisoformat(str(_snapshot()["reference_date"]))


def reference_window(reference_date: date, days: int) -> ReferenceWindow:
    snapshot = _snapshot()
    if reference_date == date.fromisoformat(
        str(snapshot["reference_date"])
    ) and days == int(snapshot["window_days"]):
        return ReferenceWindow(
            start_date=date.fromisoformat(str(snapshot["window_start"])),
            end_date=date.fromisoformat(str(snapshot["window_end"])),
            days=days,
        )
    return ReferenceWindow(
        start_date=reference_date - timedelta(days=max(0, days - 1)),
        end_date=reference_date,
        days=days,
    )


def resolved_baseline(strategy_id: str) -> ResolvedSavedStrategyConfig:
    recipe = get_strategy_recipe(strategy_id)
    return ResolvedSavedStrategyConfig(
        saved_config_id=strategy_id,
        request_config_id=strategy_id,
        strategy_id=strategy_id,
        display_name=recipe.display_name,
        description=recipe.description,
        primary_asset=recipe.primary_asset,
        summary_signal_id=recipe.signal_id,
        warmup_lookback_days=recipe.warmup_lookback_days,
        market_data_requirements=recipe.market_data_requirements,
        portfolio_bucket_mapper=recipe.portfolio_bucket_mapper,
        runtime_portfolio_mode=recipe.runtime_portfolio_mode,
        supports_daily_suggestion=recipe.supports_daily_suggestion,
        public_params={},
        build_strategy=recipe.build_strategy,
    )


def build_request(
    *,
    window: ReferenceWindow,
    total_capital: float,
    configs: list[ResolvedSavedStrategyConfig],
) -> BacktestCompareRequestV3:
    return BacktestCompareRequestV3(
        token_symbol="BTC",
        start_date=window.start_date,
        end_date=window.end_date,
        total_capital=total_capital,
        configs=[
            BacktestCompareConfigV3(
                config_id=config.request_config_id,
                strategy_id=config.strategy_id,
                params={},
            )
            for config in configs
        ],
    )


def compute_turnover(
    result: BacktestResponse, config_id: str
) -> dict[str, float | int]:
    gross = 0.0
    transfer_count = 0
    values: list[float] = []
    for point in result.timeline:
        state = point.strategies.get(config_id)
        if state is None:
            continue
        values.append(float(state.portfolio.total_value))
        for transfer in state.execution.transfers:
            gross += float(transfer.amount_usd)
            transfer_count += 1
    mean_value = fmean(values) if values else 0.0
    ratio = gross / mean_value if mean_value > 0.0 else 0.0
    annualized = ratio * (365.0 / len(values)) if values else 0.0
    return {
        "gross_usd": round(gross, 6),
        "transfer_count": transfer_count,
        "gross_over_mean_value": round(ratio, 8),
        "annualized_turnover": round(annualized, 8),
    }


def _summary_row(result: BacktestResponse, config_id: str) -> dict[str, Any]:
    summary = result.strategies[config_id]
    return {
        "roi_percent": summary.roi_percent,
        "sharpe_ratio": summary.sharpe_ratio,
        "sortino_ratio": summary.sortino_ratio,
        "calmar_ratio": summary.calmar_ratio,
        "max_drawdown_percent": summary.max_drawdown_percent,
        "trade_count": summary.trade_count,
        "volatility": summary.volatility,
        "ulcer_index": summary.ulcer_index,
        "parameters": summary.parameters,
        "turnover": compute_turnover(result, config_id),
    }


def baseline_matches_snapshot(result: BacktestResponse) -> dict[str, bool]:
    expected = _snapshot()["strategies"]
    matches: dict[str, bool] = {}
    for config_id in BASELINE_IDS:
        actual = result.strategies[config_id]
        baseline = expected[config_id]
        matches[config_id] = (
            abs(float(actual.roi_percent) - float(baseline["roi_percent"])) <= 2.0
            and abs(int(actual.trade_count) - int(baseline["trade_count"])) <= 5
        )
    return matches


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Laya direct allocation — {report['reference_date']}",
        "",
        "Offline research experiment only; no strategy is registered or exposed to production.",
        "",
        "| config | ROI % | Sharpe | Sortino | Calmar | Max DD % | trades | turnover x | targets | model calls | cache hits |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for config_id, row in report["results"].items():
        metrics = row.get("parameters", {}).get("laya_metrics", {})
        lines.append(
            "| {id} | {roi:.2f} | {sharpe:.2f} | {sortino:.2f} | {calmar:.2f} | {dd:.2f} | {trades} | {turnover:.3f} | {targets} | {calls} | {hits} |".format(
                id=config_id,
                roi=float(row["roi_percent"]),
                sharpe=float(row["sharpe_ratio"]),
                sortino=float(row["sortino_ratio"]),
                calmar=float(row["calmar_ratio"]),
                dd=float(row["max_drawdown_percent"]),
                trades=int(row["trade_count"]),
                turnover=float(row["turnover"]["annualized_turnover"]),
                targets=metrics.get("distinct_targets", "—"),
                calls=metrics.get("model_calls", "—"),
                hits=metrics.get("cache_hits", "—"),
            )
        )
    lines.extend(
        [
            "",
            "## Baseline snapshot check",
            "",
            *[
                f"- {config_id}: {'PASS' if matched else 'FAIL'}"
                for config_id, matched in report["baseline_matches_snapshot"].items()
            ],
            "",
        ]
    )
    return "\n".join(lines)


def _client_for_encoding(
    *,
    encoding: EncodingId,
    base_client: LayaDecisionClient,
    cache_path: Path | None,
    device_tag: str,
) -> LayaDecisionClient:
    if cache_path is None or encoding == "static_equal_weight":
        return base_client
    return CachedLayaClient(
        base_client,
        cache_path,
        ENCODING_VERSION[encoding],
        device_tag_override=device_tag,
    )


async def run_experiment(
    *,
    service: Any,
    reference_date: date,
    days: int,
    total_capital: float,
    encodings: tuple[EncodingId, ...],
    decision_cadence_days: int,
    base_client: LayaDecisionClient,
    cache_path: Path | None,
    device_tag: str,
    score_decoding: ScoreDecoding,
) -> tuple[dict[str, Any], BacktestResponse]:
    window = reference_window(reference_date, days)
    baselines = [resolved_baseline(strategy_id) for strategy_id in BASELINE_IDS]
    laya_configs = [
        resolved_laya_config(
            LayaExperimentSpec(
                encoding=encoding,
                decision_cadence_days=decision_cadence_days,
                score_decoding=score_decoding,
            ),
            _client_for_encoding(
                encoding=encoding,
                base_client=base_client,
                cache_path=cache_path,
                device_tag=device_tag,
            ),
        )
        for encoding in encodings
    ]
    resolved_configs = [*baselines, *laya_configs]
    prepared = await service._prepare_market_data(
        resolved_configs=resolved_configs,
        token_symbol="BTC",
        start_date=window.start_date,
        end_date=window.end_date,
        days=None,
    )
    request = build_request(
        window=window,
        total_capital=total_capital,
        configs=resolved_configs,
    )
    result = run_compare_v3_on_data(
        prices=prepared.prices,
        sentiments=prepared.sentiments,
        request=request,
        user_start_date=prepared.user_start_date,
        resolved_configs=resolved_configs,
        window=prepared.window,
    )
    rows = {
        config.request_config_id: _summary_row(result, config.request_config_id)
        for config in resolved_configs
    }
    report = {
        "reference_date": reference_date.isoformat(),
        "requested_start": window.start_date.isoformat(),
        "requested_end": window.end_date.isoformat(),
        "effective_start": prepared.user_start_date.isoformat(),
        "days": days,
        "total_capital": total_capital,
        "encodings": list(encodings),
        "decision_cadence_days": decision_cadence_days,
        "score_decoding": score_decoding,
        "model_id": base_client.model_id,
        "device": base_client.device_tag,
        "baseline_matches_snapshot": baseline_matches_snapshot(result),
        "results": rows,
    }
    return report, result


def _parse_encodings(values: list[str]) -> tuple[EncodingId, ...]:
    allowed = set(DEFAULT_ENCODINGS)
    invalid = [value for value in values if value not in allowed]
    if invalid:
        raise ValueError(f"Unknown encodings: {', '.join(invalid)}")
    return cast(tuple[EncodingId, ...], tuple(values))


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--reference-date", type=date.fromisoformat, default=default_reference_date()
    )
    parser.add_argument("--days", type=int, default=500)
    parser.add_argument("--total-capital", type=float, default=10_000.0)
    parser.add_argument("--encodings", nargs="+", default=list(DEFAULT_ENCODINGS))
    parser.add_argument("--decision-cadence-days", type=int, default=1)
    parser.add_argument(
        "--score-decoding", choices=("expected", "argmax"), default="expected"
    )
    parser.add_argument("--checkpoint", choices=tuple(CHECKPOINTS), default="english")
    parser.add_argument("--device", default=None)
    parser.add_argument("--cache-path", type=Path, default=DEFAULT_CACHE_PATH)
    parser.add_argument("--no-cache", action="store_true")
    parser.add_argument("--fake-client", action="store_true")
    parser.add_argument("--report-dir", type=Path, default=DEFAULT_REPORT_DIR)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.days <= 0 or args.decision_cadence_days <= 0:
        raise ValueError("days and decision cadence must be positive")
    encodings = _parse_encodings(list(args.encodings))
    db_url = os.environ.get("DATABASE_READ_ONLY_URL", "")
    if not db_url or db_url == "placeholder_db_url":
        print(
            "SKIP: DATABASE_READ_ONLY_URL not configured; Laya research requires the read-only historical dataset.",
            file=sys.stderr,
        )
        return 0

    if args.fake_client:
        base_client: LayaDecisionClient = FakeLayaClient()
        device_tag = "fake"
    else:
        base_client = LayaHubClient(
            model_id=CHECKPOINTS[args.checkpoint],
            device=args.device,
        )
        device_tag = args.device or "auto"
    cache_path = None if args.no_cache else args.cache_path

    init_database()
    try:
        with session_scope() as db:
            service = build_backtesting_service(db)
            report, _result = asyncio.run(
                run_experiment(
                    service=service,
                    reference_date=args.reference_date,
                    days=args.days,
                    total_capital=args.total_capital,
                    encodings=encodings,
                    decision_cadence_days=args.decision_cadence_days,
                    base_client=base_client,
                    cache_path=cache_path,
                    device_tag=device_tag,
                    score_decoding=args.score_decoding,
                )
            )
    finally:
        close_database()

    args.report_dir.mkdir(parents=True, exist_ok=True)
    stem = f"laya_direct_allocation_{args.reference_date.isoformat()}"
    json_path = args.report_dir / f"{stem}.json"
    markdown_path = args.report_dir / f"{stem}.md"
    json_path.write_text(
        json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8"
    )
    markdown_path.write_text(render_markdown(report), encoding="utf-8")
    print(render_markdown(report))
    print(json_path)
    print(markdown_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
