"""The evaluation report: one JSON document that says what a run did and why.

A report names everything it depends on (``fingerprint``: the spec's behavior
hash, the bundle's content hash, the evaluation settings, the code revision) and
carries its own hash, taken over its canonical JSON. Floats are rounded to six
decimals first, so the hash does not move with the last bit of a numpy metric.
The same inputs on the same revision give the same hash, whatever
``PYTHONHASHSEED`` is.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

REPORT_FORMAT = "strategy-report/1"
FLOAT_DIGITS = 6
SUMMARY_MAX_LINES = 15
_APP_ROOT = Path(__file__).resolve().parents[4]
_GIT_TIMEOUT_SECONDS = 10


@dataclass(frozen=True)
class Report:
    body: dict[str, Any]
    report_hash: str

    def as_dict(self) -> dict[str, Any]:
        return {**self.body, "report_hash": self.report_hash}

    def summary_lines(self) -> list[str]:
        return summary_lines(self.body, self.report_hash)


def build_report(body: Mapping[str, Any]) -> Report:
    """Normalize ``body`` and stamp it with the hash of its canonical form."""
    normalized = normalize(body)
    return Report(body=normalized, report_hash=hash_of(normalized))


def normalize(value: Any) -> Any:
    """Plain JSON: dates as text, floats rounded, sequences as lists."""
    if isinstance(value, Mapping):
        return {str(key): normalize(item) for key, item in value.items()}
    if isinstance(value, bool) or value is None or isinstance(value, str | int):
        return value
    if isinstance(value, float):
        rounded = round(value, FLOAT_DIGITS)
        return 0.0 if rounded == 0 else rounded
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Sequence):
        return [normalize(item) for item in value]
    raise TypeError(f"{type(value).__name__} cannot go in a report")


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )


def hash_of(value: Any) -> str:
    return "sha256:" + hashlib.sha256(canonical_json(value).encode()).hexdigest()


def git_state() -> dict[str, Any]:
    """The code revision a report was made on; unknown outside a checkout."""
    try:
        sha = _git("rev-parse", "HEAD")
        dirty = bool(_git("status", "--porcelain"))
    except (OSError, subprocess.SubprocessError):
        return {"sha": None, "dirty": None}
    return {"sha": sha, "dirty": dirty}


def _git(*args: str) -> str:
    done = subprocess.run(
        ["git", *args],
        cwd=_APP_ROOT,
        capture_output=True,
        text=True,
        check=True,
        timeout=_GIT_TIMEOUT_SECONDS,
    )
    return done.stdout.strip()


def summary_lines(body: Mapping[str, Any], report_hash: str) -> list[str]:
    """A short plain-text reading of the report, at most fifteen lines."""
    fingerprint = body["fingerprint"]
    window = body["window"]
    assumptions = body["assumptions"]
    strategies = body["strategies"]
    lines = [
        f"{fingerprint['spec']['ref']} on {fingerprint['bundle']['ref']} | "
        f"{window['start']}..{window['end']} ({window['days']} days)",
        f"assumptions: fill lag {assumptions['fill_lag_days']}d, slippage "
        f"{assumptions['slippage_rate'] * 100:.2f}%, stable "
        f"{assumptions['stable_apr'] * 100:.2f}% APR, capital "
        f"${body['total_capital']:,.0f}",
        f"{'':<24}{'ROI %':>8}{'MaxDD %':>9}{'Sharpe':>8}{'Trades':>8}",
    ]
    for name, item in strategies.items():
        lines.append(
            f"{name:<24}{item['roi_percent']:>8.2f}{item['max_drawdown_percent']:>9.2f}"
            f"{item['sharpe_ratio']:>8.2f}{item['trade_count']:>8}"
        )
    split = strategies["strategy"]["pnl_share_of_capital"]
    lines.append(
        f"pnl split (% of capital): price {split['price']:+.1f}, yield "
        f"{split['yield']:+.1f}, cost {split['cost']:+.1f}"
    )
    comparisons = body["comparisons"]
    if comparisons:
        lines.append(
            "ROI lead (pp): "
            + ", ".join(
                f"{name} {item['roi_pp']:+.1f}" for name, item in comparisons.items()
            )
        )
    lines.append(
        "invariants (days): "
        + ", ".join(f"{item['name']} {item['count']}" for item in body["invariants"])
    )
    lines.append(
        "rule trades: "
        + (
            ", ".join(
                f"{name} {stats['trades']}"
                for name, stats in body["attribution"]["rules"].items()
            )
            or "none"
        )
    )
    contributions = body["attribution"]["leave_one_out"]
    if contributions:
        lines.append(
            "ROI the strategy loses without (pp): "
            + ", ".join(
                f"{name} {item['roi_pp']:+.1f}" for name, item in contributions.items()
            )
        )
    if body["warnings"]:
        lines.append("warnings: " + "; ".join(body["warnings"]))
    return [*lines[: SUMMARY_MAX_LINES - 1], f"report {report_hash}"]


__all__ = [
    "FLOAT_DIGITS",
    "REPORT_FORMAT",
    "SUMMARY_MAX_LINES",
    "Report",
    "build_report",
    "canonical_json",
    "git_state",
    "hash_of",
    "normalize",
    "summary_lines",
]
