"""Rank-correlation probe: are the 6 extended metrics informative?

Reads the regenerated 500-day snapshot fixture and computes Spearman rho
between each Phase A/B extended metric and each existing risk/return metric
across the strategy universe. Outputs a markdown report whose verdict block
answers the question the registry was always meant to answer:

    "Does this new metric carry information the existing metrics miss?"

The verdict cutoffs are heuristic:

    |rho_max_with_existing| < 0.7  -> NEW INFO    (candidate to promote)
    0.7 <= |rho_max| <= 0.9        -> PARTIAL OVERLAP (regime-dependent)
    |rho_max| > 0.9                -> DUPLICATE   (snapshot keeps it,
                                                    Optuna ignores it)

With ~10 strategies the Spearman rho confidence interval is wide, so these
verdicts are suggestive, not statistical. The report surfaces the caveats
inline.

Run::

    pnpm --filter @zapengine/analytics-engine exec uv run python \\
        scripts/attribution/extended_metrics_rank_compare.py \\
        --output reports/extended_metrics_rank_correlation.md
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

APP_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = APP_ROOT / "tests/fixtures/strategy_performance_snapshot_500d.json"
DEFAULT_OUTPUT = APP_ROOT / "reports/extended_metrics_rank_correlation.md"

NEW_METRICS: tuple[str, ...] = (
    "omega_ratio",
    "tail_ratio",
    "skewness",
    "excess_kurtosis",
    "pain_index",
    "max_drawdown_recovery_days",
)
EXISTING_METRICS: tuple[str, ...] = (
    "sharpe_ratio",
    "sortino_ratio",
    "calmar_ratio",
    "max_drawdown_percent",
    "volatility",
    "ulcer_index",
)

NEW_INFO_CUTOFF = 0.7
DUPLICATE_CUTOFF = 0.9


@dataclass(frozen=True)
class ProbeArgs:
    input_path: Path
    output_path: Path
    exclude_deprecated: bool


@dataclass(frozen=True)
class StrategyUniverse:
    strategies: list[str]
    deprecated: frozenset[str]


@dataclass(frozen=True)
class CorrelationCell:
    rho: float
    is_undefined: bool


def parse_args(argv: list[str] | None = None) -> ProbeArgs:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help="Path to strategy_performance_snapshot_500d.json",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Path to write the markdown report",
    )
    parser.add_argument(
        "--exclude-deprecated",
        action="store_true",
        help="Drop strategies listed under 'deprecated_strategies' before correlating",
    )
    args = parser.parse_args(argv)
    return ProbeArgs(
        input_path=args.input,
        output_path=args.output,
        exclude_deprecated=args.exclude_deprecated,
    )


def load_universe(
    payload: dict[str, object], *, exclude_deprecated: bool
) -> StrategyUniverse:
    """Extract the strategy universe from a snapshot payload."""
    strategies_obj = payload.get("strategies")
    if not isinstance(strategies_obj, dict):
        raise ValueError("Snapshot payload missing 'strategies' dict")
    deprecated_obj = payload.get("deprecated_strategies") or []
    if not isinstance(deprecated_obj, list):
        raise ValueError("Snapshot payload 'deprecated_strategies' must be a list")
    deprecated = frozenset(str(s) for s in deprecated_obj)
    keep = [
        strategy_id
        for strategy_id in strategies_obj
        if not (exclude_deprecated and strategy_id in deprecated)
    ]
    return StrategyUniverse(strategies=sorted(keep), deprecated=deprecated)


def extract_metric_vectors(
    payload: dict[str, object],
    universe: StrategyUniverse,
    metric_keys: tuple[str, ...],
) -> dict[str, np.ndarray]:
    """Return ``{metric_key: vector_over_strategies}`` aligned with universe.strategies."""
    strategies = payload["strategies"]
    assert isinstance(strategies, dict)
    vectors: dict[str, np.ndarray] = {}
    for metric in metric_keys:
        values: list[float] = []
        for strategy_id in universe.strategies:
            entry = strategies[strategy_id]
            assert isinstance(entry, dict)
            raw = entry.get(metric)
            if not isinstance(raw, int | float):
                raise ValueError(
                    f"Snapshot entry {strategy_id!r} missing numeric metric {metric!r}"
                )
            values.append(float(raw))
        vectors[metric] = np.asarray(values, dtype=float)
    return vectors


def spearman_rho(left: np.ndarray, right: np.ndarray) -> CorrelationCell:
    """Spearman rho between two equally-sized 1-D vectors.

    Computed manually as the Pearson correlation between rank vectors so the
    script has no runtime dependency on scipy. Average-ranks are used for ties.
    Returns ``is_undefined=True`` when either input has zero variance (or
    constant ranks), in which case rho is ill-defined and is reported as 0.0.
    """
    if left.shape != right.shape:
        raise ValueError("Spearman inputs must be same shape")
    if left.size < 2:
        return CorrelationCell(rho=0.0, is_undefined=True)
    left_ranks = _average_ranks(left)
    right_ranks = _average_ranks(right)
    if np.ptp(left_ranks) == 0 or np.ptp(right_ranks) == 0:
        return CorrelationCell(rho=0.0, is_undefined=True)
    # Pearson on ranks == Spearman rho.
    centered_left = left_ranks - left_ranks.mean()
    centered_right = right_ranks - right_ranks.mean()
    numerator = float(np.sum(centered_left * centered_right))
    denominator = math.sqrt(
        float(np.sum(centered_left**2)) * float(np.sum(centered_right**2))
    )
    if denominator == 0.0:
        return CorrelationCell(rho=0.0, is_undefined=True)
    return CorrelationCell(rho=numerator / denominator, is_undefined=False)


def _average_ranks(values: np.ndarray) -> np.ndarray:
    """Mirror scipy.stats.rankdata(values, method='average')."""
    order = np.argsort(values, kind="mergesort")
    ranks = np.empty_like(order, dtype=float)
    ranks[order] = np.arange(1, values.size + 1, dtype=float)
    # Resolve ties to the average rank.
    sorted_values = values[order]
    i = 0
    while i < sorted_values.size:
        j = i + 1
        while j < sorted_values.size and sorted_values[j] == sorted_values[i]:
            j += 1
        if j - i > 1:
            tied_indices = order[i:j]
            ranks[tied_indices] = ranks[tied_indices].mean()
        i = j
    return ranks


def classify(rho_max_abs: float) -> str:
    if rho_max_abs < NEW_INFO_CUTOFF:
        return "NEW INFO"
    if rho_max_abs <= DUPLICATE_CUTOFF:
        return "PARTIAL OVERLAP"
    return "DUPLICATE"


def _distinct_rho_count(n: int) -> int:
    """Distinct Spearman ρ values reachable with n distinct-ranked vectors.

    For untied n, ρ = 1 - 6·Σd² / (n·(n²-1)). The numerator Σd² takes a
    finite set of integer values, so ρ is bounded. This is a quick gut-check
    for "is n large enough to interpret ρ?"; for n=3 the answer is 6; n=4
    gives 13; n=10 gives 81.
    """
    if n < 2:
        return 1
    # Number of permutations is n!; distinct Σd² values <= n!.
    # Upper-bound formula: floor(n*(n²-1)/6) + 1 ≈ count of integer-summable
    # squared-rank-difference totals reachable.
    return n * (n * n - 1) // 6 + 1


def build_report(
    *,
    args: ProbeArgs,
    universe: StrategyUniverse,
    cross_matrix: dict[str, dict[str, CorrelationCell]],
    internal_matrix: dict[str, dict[str, CorrelationCell]],
) -> str:
    """Assemble the markdown report."""
    generated_at = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
    n = len(universe.strategies)
    deprecated_count = len(universe.deprecated & set(universe.strategies))
    excluded_count = len(universe.deprecated) if args.exclude_deprecated else 0

    lines: list[str] = []
    lines.append("# Extended Metrics Rank-Correlation Probe")
    lines.append("")
    lines.append(f"Generated: {generated_at}")
    lines.append(f"Input: `{args.input_path}`")
    lines.append(
        f"Universe: {n} strategies "
        f"({deprecated_count} deprecated retained, "
        f"{excluded_count} deprecated excluded)"
    )
    lines.append("")
    if n < 10:
        lines.append(
            "> ⚠️ **Statistically void**: with only "
            f"{n} strategies, Spearman ρ can take at most "
            f"{_distinct_rho_count(n)} distinct values; almost any "
            "pair of monotonically-ranked metrics scores |ρ|≈1. The "
            "verdicts below are *not* informative until the universe "
            "grows past ~10 distinct strategies "
            "(or Optuna-trial parameter variants)."
        )
        lines.append("")
    lines.append("## Verdict Summary")
    lines.append("")
    lines.append("| New metric | |ρ_max| | Strongest existing | Verdict |")
    lines.append("| --- | ---: | --- | --- |")
    verdicts: dict[str, str] = {}
    for new_metric in NEW_METRICS:
        row = cross_matrix[new_metric]
        best_existing, best_cell = max(row.items(), key=lambda kv: abs(kv[1].rho))
        rho_max_abs = abs(best_cell.rho)
        verdict = classify(rho_max_abs)
        if best_cell.is_undefined:
            verdict = f"{verdict} (undefined: constant input)"
        verdicts[new_metric] = verdict
        lines.append(
            f"| `{new_metric}` | {rho_max_abs:.3f} | `{best_existing}` | **{verdict}** |"
        )
    lines.append("")

    lines.append("## Cross-Correlation Matrix (new × existing)")
    lines.append("")
    header_existing = " | ".join(f"`{m}`" for m in EXISTING_METRICS)
    lines.append(f"| | {header_existing} |")
    lines.append("| --- |" + " ---: |" * len(EXISTING_METRICS))
    for new_metric in NEW_METRICS:
        row_cells = []
        for existing in EXISTING_METRICS:
            cell = cross_matrix[new_metric][existing]
            row_cells.append("n/a" if cell.is_undefined else f"{cell.rho:+.3f}")
        lines.append(f"| `{new_metric}` | " + " | ".join(row_cells) + " |")
    lines.append("")

    lines.append("## Internal Redundancy (new × new)")
    lines.append("")
    header_new = " | ".join(f"`{m}`" for m in NEW_METRICS)
    lines.append(f"| | {header_new} |")
    lines.append("| --- |" + " ---: |" * len(NEW_METRICS))
    for a in NEW_METRICS:
        row_cells = []
        for b in NEW_METRICS:
            cell = internal_matrix[a][b]
            row_cells.append("n/a" if cell.is_undefined else f"{cell.rho:+.3f}")
        lines.append(f"| `{a}` | " + " | ".join(row_cells) + " |")
    lines.append("")

    lines.append("## Caveats")
    lines.append("")
    lines.append(
        f"- With {n} strategies, Spearman ρ has wide confidence intervals — "
        "verdicts are suggestive, not statistical."
    )
    lines.append(
        f"- Cutoffs are heuristic: |ρ| < {NEW_INFO_CUTOFF} → NEW INFO; "
        f"{NEW_INFO_CUTOFF} ≤ |ρ| ≤ {DUPLICATE_CUTOFF} → PARTIAL OVERLAP; "
        f"|ρ| > {DUPLICATE_CUTOFF} → DUPLICATE."
    )
    lines.append(
        "- `n/a` cells indicate constant input (zero variance) where ρ is undefined."
    )
    lines.append(
        "- `pain_index` and `ulcer_index` both penalize drawdown duration — high overlap is expected."
    )
    lines.append("")

    lines.append("## Per-Metric Recommendations")
    lines.append("")
    for new_metric in NEW_METRICS:
        verdict = verdicts[new_metric]
        lines.append(f"### `{new_metric}` → **{verdict}**")
        if verdict.startswith("NEW INFO"):
            lines.append(
                "  - Promote candidate for the next attribution sweep / Optuna objective."
            )
        elif verdict.startswith("PARTIAL OVERLAP"):
            lines.append(
                "  - Keep in the snapshot fixture for regime-specific diagnostic value."
            )
            lines.append(
                "  - Not yet justified as an Optuna objective — gather more strategy variants first."
            )
        else:
            lines.append(
                "  - Tracks an existing metric. Keep in snapshot but treat as redundant; "
                "do not add to Optuna objective space."
            )
        lines.append("")
    return "\n".join(lines)


def run(args: ProbeArgs) -> str:
    payload_raw = json.loads(args.input_path.read_text())
    if not isinstance(payload_raw, dict):
        raise ValueError("Snapshot payload root must be an object")
    universe = load_universe(payload_raw, exclude_deprecated=args.exclude_deprecated)
    if len(universe.strategies) < 3:
        raise ValueError(
            f"Need at least 3 strategies to correlate; got {len(universe.strategies)}"
        )
    vectors = extract_metric_vectors(
        payload_raw, universe, NEW_METRICS + EXISTING_METRICS
    )
    cross_matrix = {
        new_metric: {
            existing: spearman_rho(vectors[new_metric], vectors[existing])
            for existing in EXISTING_METRICS
        }
        for new_metric in NEW_METRICS
    }
    internal_matrix = {
        a: {b: spearman_rho(vectors[a], vectors[b]) for b in NEW_METRICS}
        for a in NEW_METRICS
    }
    report = build_report(
        args=args,
        universe=universe,
        cross_matrix=cross_matrix,
        internal_matrix=internal_matrix,
    )
    args.output_path.parent.mkdir(parents=True, exist_ok=True)
    args.output_path.write_text(report)
    return report


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    report = run(args)
    sys.stdout.write(f"Wrote rank-correlation report to {args.output_path}\n")
    # Echo the verdict table so CI / humans can read it without opening the file.
    for line in report.splitlines():
        if line.startswith("| `") or line.startswith("## Verdict"):
            sys.stdout.write(line + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
