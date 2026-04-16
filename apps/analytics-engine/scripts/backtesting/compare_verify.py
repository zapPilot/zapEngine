"""Strict verification helpers for executed DMA cross events."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from typing import Any, Literal

from scripts.backtesting.compare_payload import (
    VerificationError,
    iter_normalized_points,
    load_timeline,
    portfolio_weights,
    select_strategy_id,
)
from scripts.backtesting.compare_payload import (
    require_mapping as _require_mapping,
)

CrossEvent = Literal["cross_down", "cross_up"]
WEIGHT_TOLERANCE = 1e-4


@dataclass(frozen=True)
class CrossCheck:
    date: str
    cross_event: CrossEvent
    reason: str
    immediate_execution: bool
    spot_weight: float
    stable_weight: float


@dataclass(frozen=True)
class VerificationReport:
    strategy_id: str
    cross_checks: tuple[CrossCheck, ...]


def iter_cross_signal_points(
    timeline: list[dict[str, Any]],
    strategy_id: str,
) -> list[tuple[str, dict[str, Any]]]:
    cross_points: list[tuple[str, dict[str, Any]]] = []
    for point in iter_normalized_points(timeline, strategy_id):
        signal = point["signal"]
        if signal is None:
            continue
        dma = signal["dma"]
        cross_event = dma.get("cross_event")
        if cross_event in {"cross_down", "cross_up"}:
            cross_points.append((point["date"], point))
    return cross_points


def validate_cross_point(
    *, date_value: str, strategy_point: dict[str, Any]
) -> CrossCheck:
    signal = strategy_point.get("signal")
    if not isinstance(signal, dict):
        raise VerificationError(f"{date_value}.signal must be an object.")
    dma = _require_mapping(signal.get("dma"), label=f"{date_value}.signal.dma")
    decision = _require_mapping(
        strategy_point.get("decision"), label=f"{date_value}.decision"
    )
    execution = strategy_point.get("execution")
    if not isinstance(execution, dict):
        raise VerificationError(f"{date_value}.execution must be an object.")

    cross_event = dma.get("cross_event")
    reason = str(decision.get("reason") or "")
    immediate = bool(decision.get("immediate", False))
    event = execution.get("event")
    weights = portfolio_weights(strategy_point)

    failures: list[str] = []
    if event != "rebalance":
        failures.append(f"expected execution.event='rebalance', got {event!r}")
    if not immediate:
        failures.append(f"expected decision.immediate=True, got {immediate!r}")

    if cross_event == "cross_down":
        if reason != "dma_cross_down":
            failures.append(
                f"expected decision.reason='dma_cross_down', got {reason!r}"
            )
        if weights["spot"] > WEIGHT_TOLERANCE:
            failures.append(f"spot weight {weights['spot']:.6f} exceeds tolerance")
        if weights["stable"] < 1.0 - WEIGHT_TOLERANCE:
            failures.append(
                f"stable weight {weights['stable']:.6f} is below required full-exit level"
            )
        if failures:
            raise VerificationError(
                f"{date_value} cross_down failed validation: {'; '.join(failures)}."
            )
        return CrossCheck(
            date=date_value,
            cross_event="cross_down",
            reason="dma_cross_down",
            immediate_execution=True,
            spot_weight=weights["spot"],
            stable_weight=weights["stable"],
        )

    if cross_event == "cross_up":
        if reason != "dma_cross_up":
            failures.append(f"expected decision.reason='dma_cross_up', got {reason!r}")
        if weights["stable"] > WEIGHT_TOLERANCE:
            failures.append(f"stable weight {weights['stable']:.6f} exceeds tolerance")
        if weights["spot"] < 1.0 - WEIGHT_TOLERANCE:
            failures.append(
                f"spot weight {weights['spot']:.6f} is below required full-entry level"
            )
        if failures:
            raise VerificationError(
                f"{date_value} cross_up failed validation: {'; '.join(failures)}."
            )
        return CrossCheck(
            date=date_value,
            cross_event="cross_up",
            reason="dma_cross_up",
            immediate_execution=True,
            spot_weight=weights["spot"],
            stable_weight=weights["stable"],
        )

    raise VerificationError(
        f"{date_value} does not contain a supported cross event: {cross_event!r}."
    )


def verify(
    path: str,
    strategy_id: str | None = None,
    *,
    required_cross_down_dates: tuple[str, ...] = (),
) -> VerificationReport:
    timeline = load_timeline(path)
    selected_strategy_id = select_strategy_id(timeline, strategy_id)
    cross_points = iter_cross_signal_points(timeline, selected_strategy_id)
    if not cross_points:
        raise VerificationError(
            "Selected strategy timeline does not contain any DMA cross signals."
        )

    seen_cross_down_dates = {
        date_value
        for date_value, strategy_point in cross_points
        if _require_mapping(
            _require_mapping(strategy_point.get("signal"), label="signal").get("dma"),
            label="signal.dma",
        ).get("cross_event")
        == "cross_down"
    }
    for required_date in required_cross_down_dates:
        if required_date not in seen_cross_down_dates:
            raise VerificationError(
                f"Required cross_down date {required_date} was not found in timeline."
            )

    validated = tuple(
        validate_cross_point(date_value=date_value, strategy_point=strategy_point)
        for date_value, strategy_point in cross_points
    )
    return VerificationReport(strategy_id=selected_strategy_id, cross_checks=validated)


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backtest_result", help="Path to compare-v3 backtest JSON")
    parser.add_argument(
        "--strategy-id", help="Strategy id when response contains multiple strategies"
    )
    parser.add_argument(
        "--require-cross-down-date",
        action="append",
        dest="required_cross_down_dates",
        default=[],
        help="Require one or more cross_down dates to exist and validate",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_arg_parser()
    args = parser.parse_args(argv)
    try:
        report = verify(
            args.backtest_result,
            args.strategy_id,
            required_cross_down_dates=tuple(args.required_cross_down_dates),
        )
    except VerificationError as exc:
        print(f"ERROR: {exc}")
        return 1

    print(
        f"PASS: validated {len(report.cross_checks)} cross events for strategy {report.strategy_id}."
    )
    for check in report.cross_checks:
        print(
            f"  - {check.date}: {check.cross_event} "
            f"(spot={check.spot_weight:.6f}, stable={check.stable_weight:.6f})"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
