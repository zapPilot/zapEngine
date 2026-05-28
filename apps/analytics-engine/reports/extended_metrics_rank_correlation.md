# Extended Metrics Rank-Correlation Probe

Generated: 2026-05-28 23:07 UTC
Input: `/Users/chouyasushi/htdocs/zapPilot/zapEngine/apps/analytics-engine/tests/fixtures/strategy_performance_snapshot_500d.json`
Universe: 3 strategies (0 deprecated retained, 0 deprecated excluded)

> ⚠️ **Statistically void**: with only 3 strategies, Spearman ρ can take at most 5 distinct values; almost any pair of monotonically-ranked metrics scores |ρ|≈1. The verdicts below are *not* informative until the universe grows past ~10 distinct strategies (or Optuna-trial parameter variants).

## Verdict Summary

| New metric | |ρ_max| | Strongest existing | Verdict |
| --- | ---: | --- | --- |
| `omega_ratio` | 1.000 | `sharpe_ratio` | **DUPLICATE** |
| `tail_ratio` | 1.000 | `sharpe_ratio` | **DUPLICATE** |
| `skewness` | 1.000 | `sharpe_ratio` | **DUPLICATE** |
| `excess_kurtosis` | 0.500 | `sharpe_ratio` | **NEW INFO** |
| `pain_index` | 1.000 | `sharpe_ratio` | **DUPLICATE** |
| `max_drawdown_recovery_days` | 0.866 | `sharpe_ratio` | **PARTIAL OVERLAP** |

## Cross-Correlation Matrix (new × existing)

| | `sharpe_ratio` | `sortino_ratio` | `calmar_ratio` | `max_drawdown_percent` | `volatility` | `ulcer_index` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `omega_ratio` | +1.000 | +1.000 | +1.000 | +1.000 | -1.000 | -1.000 |
| `tail_ratio` | +1.000 | +1.000 | +1.000 | +1.000 | -1.000 | -1.000 |
| `skewness` | +1.000 | +1.000 | +1.000 | +1.000 | -1.000 | -1.000 |
| `excess_kurtosis` | +0.500 | +0.500 | +0.500 | +0.500 | -0.500 | -0.500 |
| `pain_index` | -1.000 | -1.000 | -1.000 | -1.000 | +1.000 | +1.000 |
| `max_drawdown_recovery_days` | -0.866 | -0.866 | -0.866 | -0.866 | +0.866 | +0.866 |

## Internal Redundancy (new × new)

| | `omega_ratio` | `tail_ratio` | `skewness` | `excess_kurtosis` | `pain_index` | `max_drawdown_recovery_days` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `omega_ratio` | +1.000 | +1.000 | +1.000 | +0.500 | -1.000 | -0.866 |
| `tail_ratio` | +1.000 | +1.000 | +1.000 | +0.500 | -1.000 | -0.866 |
| `skewness` | +1.000 | +1.000 | +1.000 | +0.500 | -1.000 | -0.866 |
| `excess_kurtosis` | +0.500 | +0.500 | +0.500 | +1.000 | -0.500 | -0.866 |
| `pain_index` | -1.000 | -1.000 | -1.000 | -0.500 | +1.000 | +0.866 |
| `max_drawdown_recovery_days` | -0.866 | -0.866 | -0.866 | -0.866 | +0.866 | +1.000 |

## Caveats

- With 3 strategies, Spearman ρ has wide confidence intervals — verdicts are suggestive, not statistical.
- Cutoffs are heuristic: |ρ| < 0.7 → NEW INFO; 0.7 ≤ |ρ| ≤ 0.9 → PARTIAL OVERLAP; |ρ| > 0.9 → DUPLICATE.
- `n/a` cells indicate constant input (zero variance) where ρ is undefined.
- `pain_index` and `ulcer_index` both penalize drawdown duration — high overlap is expected.

## Per-Metric Recommendations

### `omega_ratio` → **DUPLICATE**
  - Tracks an existing metric. Keep in snapshot but treat as redundant; do not add to Optuna objective space.

### `tail_ratio` → **DUPLICATE**
  - Tracks an existing metric. Keep in snapshot but treat as redundant; do not add to Optuna objective space.

### `skewness` → **DUPLICATE**
  - Tracks an existing metric. Keep in snapshot but treat as redundant; do not add to Optuna objective space.

### `excess_kurtosis` → **NEW INFO**
  - Promote candidate for the next attribution sweep / Optuna objective.

### `pain_index` → **DUPLICATE**
  - Tracks an existing metric. Keep in snapshot but treat as redundant; do not add to Optuna objective space.

### `max_drawdown_recovery_days` → **PARTIAL OVERLAP**
  - Keep in the snapshot fixture for regime-specific diagnostic value.
  - Not yet justified as an Optuna objective — gather more strategy variants first.
