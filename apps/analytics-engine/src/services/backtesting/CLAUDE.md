# Backtesting Strategy Iteration

This file is auto-loaded by Claude Code when working on backtesting strategies.
It captures iteration history, attribution findings, and conventions that the
500-day snapshot fixture (`tests/fixtures/strategy_performance_snapshot_500d.json`)
encodes as numbers but doesn't explain.

If you are NOT working on strategy iteration, you can skip this file.

## Active strategies

| Strategy ID | Status | ROI (500d) | Source file |
|---|---|---:|---|
| `dma_fgi_hierarchical_minimum` | **Current iteration target** | 121.44% | [hierarchical_minimum.py](./strategies/hierarchical_minimum.py) |
| `dma_fgi_hierarchical_prod` | Current production (= `_full`) | 36.62% | [spy_crypto_hierarchical_rotation.py](./strategies/spy_crypto_hierarchical_rotation.py) |
| `dma_fgi_eth_btc_minimum` | Research-only — see iteration log entry 2026-05-02 | 145.28% | [eth_btc_minimum.py](./strategies/eth_btc_minimum.py) |
| `dma_fgi_adaptive_binary_eth_btc` | Production benchmark champion (no SPY, non-research) | 141.21% | [pair_rotation_template.py](./strategies/pair_rotation_template.py) |
| `dma_fgi_hierarchical_control` | Original hierarchical baseline | 91.95% | spy_crypto_hierarchical_rotation.py |
| `eth_btc_rotation_attribution_full` | ETH/BTC attribution baseline | 126.91% | [eth_btc_attribution.py](./strategies/eth_btc_attribution.py) |

The composable architecture lives in:
- [pair_rotation_template.py](./strategies/pair_rotation_template.py) — generic two-unit DMA-gated rotation, used as both outer (SPY/crypto) and inner (ETH/BTC) layers
- [hierarchical_outer_policy.py](./strategies/hierarchical_outer_policy.py) — `HierarchicalOuterDecisionPolicy` Protocol + concrete `FullFeaturedOuterPolicy` (legacy) and `MinimumHierarchicalOuterPolicy` (current)

`MinimumHierarchicalOuterPolicy` has **zero dataclass fields** by design — every potential tunable was tested and removed. Don't add fields without a snapshot diff justifying it.

## What works (do not regress)

Each entry includes the commit where the finding was established and the ROI
delta from the relevant leave-one-out variant in the snapshot fixture.

### DMA stable gating
- **Δ when removed**: -96.96pp ROI (`dma_fgi_hierarchical_minimum_minus_dma_gating` = 24.48% vs current minimum 121.44%; originally -96.68pp vs 121.16% at establishment)
- **Established**: commit `fe8db22` (minimum strategy + leave-one-out variants)
- **Mechanism**: when crypto < CRYPTO_DMA in fear regime, lift to stable. Foundation feature — without it the strategy reduces to undisciplined DCA.

### Greed Sell Suppression
- **Δ when removed**: -22.10pp ROI in current minimum (`_minus_greed_suppression` = 99.34% vs 121.44%; originally -22.05pp with 99.11% vs 121.16%); -21.08pp in NoDMA Full (`nodma_full_minus_greed_sell_suppression` 89.80% vs sibling baseline 110.88%)
- **2-asset check**: `dma_fgi_eth_btc_minimum` = 145.28% vs `dma_fgi_adaptive_binary_eth_btc` = 141.21%, so plain greed sell suppression is also +4.07pp in the ETH/BTC-only context.
- **Established**: cross-validated across two baseline contexts
- **Mechanism**: when in plain greed regime and `disabled_rules` includes `PLAIN_GREED_SELL_RULE`, suppress the sell-to-stable intent. Counter-intuitively, NOT taking profit on greed outperforms taking profit because the greed regime in 2024–2026 was a continuation signal, not a top signal. The separate `above_extreme_greed_sell` rule remains active.

### Inner ETH/BTC ratio rotation (`ADAPTIVE_BINARY_ETH_BTC_TEMPLATE`)
- **Evidence**: `dma_fgi_adaptive_binary_eth_btc` (uses this template alone) is the non-research benchmark at 141.21% ROI, 4.67 Calmar
- **Established**: pre-existing strategy, validated by snapshot
- **Mechanism**: ratio-zone classification (above/at/below ETH-BTC ratio DMA) drives binary BTC↔ETH allocation within the crypto sleeve. Reused by hierarchical strategies as the inner layer.

## What doesn't work (do not re-introduce without new evidence)

These features were tested via leave-one-out attribution and removed. If you
think one of them is needed, you must justify with a new snapshot diff showing
it adds positive contribution in the current minimum environment — historical
"intuition" is not enough.

### Adaptive DMA Reference (`adaptive_crypto_dma_reference`)
- **Δ when removed**: +74.26pp ROI (`dma_fgi_hierarchical_full_minus_adaptive_dma` 110.88% vs full 36.62%)
- **Confirmed harmful in**: hierarchical full, NoDMA full, single-feature-only (`adaptive_dma_only` 37.42%)
- **Excluded at type level**: `MinimumHierarchicalOuterPolicy` has no `adaptive_crypto_dma_reference` field
- **Last seen in**: `FullFeaturedOuterPolicy` (legacy, kept until Phase B production migration)

### Fear Recovery Buy (`below_fear_recovering_buy` rule)
- **Δ in `_only` variant**: ROI 14.28%, Calmar 0.67 (worst non-DCA strategy in fixture)
- **Δ when removed from minimum**: ~0pp (already removed; minimum doesn't include it)
- **Δ when removed from full**: -6.17pp (full_minus_fear_recovery 30.45% vs full 36.62%; small "negative" because full is poisoned by Adaptive DMA, masking the rule's true neutrality)
- **Trade-off**: removes the `extreme_fear_dca_2025_11_21` and `extreme_fear_dca_2026_02_06` event-validator triggers in `tests/fixtures/hierarchical_validation_events.json`. **This is intentional** — those events validate the legacy production behavior, not the minimum's.

### SPY Cross-Up Latch (`spy_cross_up_latch`)
- **Δ when removed from full**: -0.69pp (noise)
- **Δ when removed from NoDMA full**: +3.86pp (slightly net negative)
- **Δ in minimum**: not applicable — removed entirely
- **Why SPY still gets allocated without it**: outer pair-template (`SPY_CRYPTO_TEMPLATE`) DMA gating runs independently of the latch. SPY > SPY_DMA → SPY allocated. The latch was a 14-day "follow-through" ratchet that the data says is unnecessary.

### Buy Floor (`dma_buy_strength_floor`)
- **Δ when removed from minimum**: +0.28pp (`minimum_minus_buy_floor` 121.44% vs old minimum 121.16%, 1 trade difference)
- **Verdict**: noise. Removed at type level in commit `e3e140c` (Buy Floor removal + Phase A deprecation).
- **Past confusion**: in NoDMA Full, leave-one-out showed -2.65pp Δ — looked meaningful. The 0.28pp result in the cleaner minimum environment shows that earlier delta was a feature-interaction artifact, not a real Buy Floor effect.

## Conventions

### Signal/noise threshold
- **|Δ| < 0.5pp ROI** = noise, do not interpret
- **0.5pp ≤ |Δ| < 2pp** = weak signal; require confirmation in second baseline before acting
- **|Δ| ≥ 2pp** = actionable

### Window choice
- Always use the 500-day production window (matches frontend `DEFAULT_DAYS = 500`).
- The yearly windows in `sweep_hierarchical.py` (`2024`, `2025`, `2026`) are **diagnostic only** — path-dependent state (cooldowns, latches, ratchets) resets at year boundaries, breaking path-dependent strategies.
- The snapshot fixture's `reference_date` is pinned (`2026-04-15` as of last update). Do not change it without explicit re-anchoring; otherwise drift detection becomes meaningless.

### Per-metric tolerances (in fixture, also defaults)
| Metric | Tolerance |
|---|---|
| `roi_percent` | ±2.0 (absolute pct) |
| `calmar_ratio` | ±0.10 |
| `sharpe_ratio` | ±0.10 |
| `max_drawdown_percent` | ±1.0 (absolute pct) |
| `trade_count` | ±5 |

### Naming
- `_minus_X` = leave-one-out variant (full set minus feature X)
- `_only` = isolation variant (control + feature X alone)
- `[DEPRECATED]` prefix = retained for historical comparison but excluded from default sweep runs (Phase A); code path remains until Phase B
- `[RESEARCH]` prefix = retained in snapshot for attribution but excluded from default `--check`; do not promote without a separate production decision
- `(sucks)` prefix = pre-existing label for confirmed-bad strategies (kept as anti-baselines)

### Adding a new variant
1. Append entry to relevant `*_VARIANTS` dict (e.g. `MINIMUM_HIERARCHICAL_VARIANTS`)
2. Add display name in [constants.py](./constants.py)
3. Add recipe in [strategy_registry.py](./strategy_registry.py)
4. Run `sweep_production_window.py --update-snapshot`
5. Inspect snapshot diff and update this CLAUDE.md's "Active strategies" or iteration log

## Iteration log

Newest first. Each entry: date, commit, finding, key numbers.

### 2026-05-02 — SPY tax decomposition via `dma_fgi_eth_btc_minimum`
- **Commit**: pending
- **Hypothesis**: 20pp gap between `dma_fgi_adaptive_binary_eth_btc` (141%) and `dma_fgi_hierarchical_minimum` (121%) is some mix of SPY constraint cost / outer-policy architecture cost / context-dependent greed_sell_suppression.
- **Result**: `dma_fgi_eth_btc_minimum` ROI = 145.28%.
- **Interpretation**: Greed_sell_suppression is **net positive in 2-asset too**. SPY tax is even larger than 20pp; outer policy is recovering some of it.
- **Next action**: Audit `dma_fgi_adaptive_binary_eth_btc` to add greed_sell_suppression, then promote that as the new champion benchmark if the production-grade variant reproduces the research result.

### 2026-04-15 — Buy Floor removed, Phase A deprecation
- **Commit**: `e3e140c` (Buy Floor removal + 8 strategies marked DEPRECATED)
- **Finding**: `dma_buy_strength_floor` has +0.28pp Δ in the minimum baseline (1 trade difference over 500 days). Below noise threshold. Removed from `MinimumHierarchicalOuterPolicy` at the type level. Added `feature_summary()` method to outer policy Protocol.
- **Snapshot delta**: `dma_fgi_hierarchical_minimum` 121.16% → ~121.44% (matches old `_minus_buy_floor` exactly, validating behavior-equivalence).
- **Deprecated**: 4 `full_minus_*` Phase 1 variants (poisoned by Adaptive DMA), `adaptive_dma_only`, `fear_recovery_only`, two `(sucks)` controls.

### 2026-04-15 — `dma_fgi_hierarchical_minimum` shipped
- **Commit**: `fe8db22`
- **Finding**: Minimum hierarchical SPY/crypto strategy (DMA gating + Greed Sell Suppression + Buy Floor + inner ETH/BTC rotation) hits 121.16% ROI vs production 36.62%. Validates that Adaptive DMA Reference + Fear Recovery Buy + SPY Cross-Up Latch are all unnecessary or harmful.
- **Architecture**: introduced `HierarchicalOuterDecisionPolicy` Protocol, extracted `FullFeaturedOuterPolicy` from existing strategy class (behavior-preserving refactor), added `MinimumHierarchicalOuterPolicy` as a 2-feature composition.
- **Snapshot deltas**:
  - `dma_fgi_hierarchical_minimum`: 121.16% ROI, 4.50 Calmar
  - `_minus_greed_suppression`: 99.11% (-22.05pp Δ — Greed Sell Suppression strongest active feature)
  - `_minus_buy_floor`: 121.44% (+0.28pp Δ — Buy Floor noise; led to next iteration)
  - `_minus_dma_gating`: 24.48% (-96.68pp Δ — DMA gating is foundation)

### 2026-04-15 — 500-day snapshot fixture established
- **Commit**: `6b09fa6` (snapshot fixture + sweep_production_window.py)
- **Finding**: Yearly attribution windows in `sweep_hierarchical.py` don't predict 500-day production performance — path-dependent state resets at year boundaries. New script runs the same 500-day window the frontend uses, with snapshot fixture as ground truth.
- **Cross-strategy bug surfaced**: `test_spy_does_not_dilute_total_return` and `test_production_not_worse_than_ablations` fail on initial snapshot — these are intentional regression markers for the next iteration to fix.

### Adding new entries

When you complete an iteration, prepend a new entry above with:
1. Date
2. Commit hash (use `git rev-parse --short HEAD` after merging)
3. One-paragraph finding
4. Key snapshot delta numbers (copy from `git diff` of fixture)

## Commands

Start the API first for scripts that call `/api/v3/backtesting/compare`:

```bash
pnpm --filter @zapengine/analytics-engine dev
```

### Strategy Performance Snapshot

```bash
# Show drift vs snapshot (diagnostic; never fails on metric drift)
pnpm --filter @zapengine/analytics-engine exec uv run python \
  scripts/attribution/sweep_production_window.py

# Strict CI gate (exits 1 when drift exceeds per-metric tolerance)
pnpm --filter @zapengine/analytics-engine test:strategy-snapshot

# Update snapshot after intentional behavior change
pnpm --filter @zapengine/analytics-engine exec uv run python \
  scripts/attribution/sweep_production_window.py --update-snapshot

# Ad hoc strict check with explicit per-metric tolerances
pnpm --filter @zapengine/analytics-engine exec uv run python \
  scripts/attribution/sweep_production_window.py --check \
  --tolerance roi=2.0,calmar=0.10,sharpe=0.10,max_dd=1.0,trades=5

# Exclude deprecated/research strategies (default for --check)
sweep_production_window.py --exclude-deprecated
```

### Hierarchical Attribution Sweep (yearly windows; diagnostic only)

```bash
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/sweep_hierarchical.py \
  --windows 2024,2025,2026,combined \
  --out attribution_$(date -I).md
```

Phase 2 NoDMA leave-one-out sweep (historical diagnostic):

```bash
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/sweep_hierarchical.py \
  --windows 2024,2025,2026,combined \
  --baseline-strategy dma_fgi_hierarchical_full_minus_adaptive_dma \
  --variants dma_fgi_hierarchical_full_minus_adaptive_dma,dma_fgi_hierarchical_nodma_full_minus_spy_latch,dma_fgi_hierarchical_nodma_full_minus_greed_sell_suppression,dma_fgi_hierarchical_nodma_full_minus_buy_floor,dma_fgi_hierarchical_nodma_full_minus_fear_recovery_buy \
  --out attribution_phase2_$(date -I).md
```

Quick single-window run:

```bash
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/sweep_hierarchical.py \
  --windows 2025
```

Useful `sweep_hierarchical.py` options:

```bash
--endpoint http://localhost:8001   # API base URL; this is the default
--windows 2024,2025,2026,combined  # comma-separated windows to run
--total-capital 10000              # default initial capital
--baseline-strategy <strategy-id>  # baseline for delta Calmar and validation
--variants <strategy-id,...>       # optional registered variant subset
--out attribution_2026-05-01.md    # optional markdown output path
--no-progress                      # disable stderr progress bar
```

### Hierarchical Regression Events

```bash
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/validate_hierarchical_events.py \
  --out hierarchical_validation_$(date -I).md

# Validate against a specific strategy (e.g. minimum)
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/validate_hierarchical_events.py \
  --strategy-id dma_fgi_hierarchical_minimum \
  --config-id dma_fgi_hierarchical_minimum
```

Note: the minimum strategy intentionally fails `extreme_fear_dca_*` events because Fear Recovery Buy is excluded.
