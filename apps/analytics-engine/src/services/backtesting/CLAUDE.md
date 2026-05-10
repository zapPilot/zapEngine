# Backtesting Strategy Iteration

This file is auto-loaded by Claude Code when working on backtesting strategies.
For historical iteration records, see [ITERATION_LOG.md](./ITERATION_LOG.md).

If you are NOT working on strategy iteration, you can skip this file.

## Current template baseline

**`dma_fgi_hierarchical_minimum`** — 121.30% ROI, 4.63 Calmar, 500d window.

### Composition

```
Outer layer (SPY / crypto):  SPY_CRYPTO_TEMPLATE with DMA gating
  └── Inner layer (ETH / BTC): ADAPTIVE_BINARY_ETH_BTC_TEMPLATE (ratio rotation)

Outer policy: MinimumHierarchicalOuterPolicy (zero tunable fields)
  ├── Feature 1: DMA stable gating  (DmaGatedFgiDecisionPolicy in hierarchical_outer_policy.py)
  │   └── When crypto < CRYPTO_DMA in fear regime → lift to stable
  ├── Feature 2: Greed Sell Suppression  (FULL_DISABLED_RULES in hierarchical_attribution.py)
  │   └── When extreme greed + PLAIN_GREED_SELL_RULE not disabled → suppress sell-to-stable
  ├── Feature 3: SPY macro extreme-fear DCA
  │   └── When CNN macro F&G is extreme fear and SPY < SPY_DMA → buy SPY from stable
  └── Feature 4: Persistent SPY latch
      └── On SPY cross_up, redeploy existing stable to SPY; while latch remains active, redirect fresh stable from later sells into SPY
```

Source files:
- [hierarchical_minimum.py](./strategies/hierarchical_minimum.py) — strategy recipe
- [hierarchical_outer_policy.py](./strategies/hierarchical_outer_policy.py) — `MinimumHierarchicalOuterPolicy` Protocol implementation
- [pair_rotation_template.py](./strategies/pair_rotation_template.py) — generic two-unit DMA-gated rotation (outer + inner reuse)

`MinimumHierarchicalOuterPolicy` has **zero dataclass fields** by design — every potential tunable was tested and removed. Don't add fields without a snapshot diff justifying it.

### Reference benchmarks

| Strategy | ROI (500d) | Notes |
|---|---|---|
| `dma_fgi_portfolio_rules` | 50.52% | Flat rule-engine baseline after 2026-05-09 rule ports; new ports need review |
| `eth_btc_rotation` | 126.26% | Saved-config live default |
| `dma_fgi_hierarchical_control` | 88.64% | Attribution baseline |
| `dma_fgi_hierarchical_minimum` | 121.30% | Current production target |

### Portfolio rules family

`dma_fgi_portfolio_rules` is the canonical flat rule-engine baseline. It keeps
the nine user-facing strategy rules in `portfolio_rules/` as portfolio-snapshot
rules, then applies post-decision risk guards from `risk/` before atomic
execution through `RuleBasedAllocationExecutor`. Cross-down cooldown is per
symbol: BTC/ETH/SPY use 30 days by default. The 500-day fixture baseline is
50.52% ROI, 3.73 Calmar, -9.32% MaxDD, and 52 trades. It is a traceability
baseline, not a performance target; compare rule attribution against the
canonical entry. The 2026-05-09 flat ports for DMA stable gating, greed sell
suppression, and ETH/BTC deviation DCA are active for traceability, but their
leave-one-out attribution is negative and they should not be promoted without
retuning.

### Coverage scope

Coverage is measured against `dma_fgi_portfolio_rules` and shared backtesting
infrastructure. Alternative strategy implementations and attribution/research
recipes are intentionally omitted from coverage measurement:
`eth_btc_rotation.py`, `spy_eth_btc_rotation.py`,
`spy_crypto_hierarchical_rotation.py`, `hierarchical_minimum.py`,
`hierarchical_outer_policy.py`, `hierarchical_attribution.py`,
`pair_rotation_template.py`, and `dma_top_escape.py`. Keep shared components
measured, including `strategies/base.py`, `composed_signal.py`,
`dma_gated_fgi.py`, `minimum.py`, and `dma_fgi_portfolio_rules.py`.
Validation-event runner and decision-log audit tooling are also omitted from
line coverage; verify them by running their pytest files and the
validation/snapshot commands instead of padding runtime coverage.

## Iteration discipline

Before claiming a strategy change is done:

1. **Run the validation suite for the strategy you changed**:
   ```bash
   pnpm --filter @zapengine/analytics-engine exec uv run python scripts/analyze_compare.py \
     --saved-config-id <strategy_id> --from-date 2025-01-01 --to-date 2026-04-10 --summary
   ```
   Validation events must all pass. Non-zero exit blocks the change.

2. **Add a validation event for the new behavior**: any new feature, rule, or signal must add ≥1 entry to `tests/fixtures/hierarchical_validation_events.json` exercising the new behavior on a real historical date with `applicable_strategies` listing the strategies the new feature applies to. The supported fixture schema and assertion types are documented in `tests/fixtures/README.md`.

3. **Run the snapshot regenerate** if the change is meant to shift performance: `pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/sweep_production_window.py --update-snapshot` and inspect the diff.

4. **Append an ITERATION_LOG.md entry** with the commit hash + ROI/Calmar/trades delta + which validation events were added.

The pytest gate (`pnpm test`) currently scopes `tests/test_validation_events.py` to `dma_fgi_portfolio_rules` only while the `phase4-risk-sizing` iteration is in progress. TODO: widen this gate again after the canonical strategy failures are resolved.

## What works (do not regress)

Each finding is established by ROI delta from leave-one-out variants in the snapshot fixture unless explicitly marked as fixture-validated.

| Feature | Δ when removed | Established |
|---|---|---|
| DMA stable gating | **-96.96pp** ROI | `fe8db22` |
| Greed Sell Suppression | **-22.05pp** ROI | cross-validated |
| Inner `ADAPTIVE_BINARY_ETH_BTC_TEMPLATE` (continuous, sat. at 20% DMA distance) | wired into `dma_fgi_hierarchical_minimum`; contributes to 121.30% ROI | composition-validated |
| Standalone `eth_btc_rotation` (binary cross on 200d DMA, 30d cooldown) | 126.26% ROI | pre-existing |
| SPY macro extreme-fear DCA | Fixture-validated; included in 2026-05-04 re-anchor: ROI -0.14pp, Calmar +0.12 | 2026-05-04 |
| Persistent SPY latch | Fixture-validated cross-up-day existing stable redeploy plus later fresh-stable absorption; re-anchor: ROI -0.14pp, MaxDD +0.48pp, trades -4 | 2026-05-04 |

## What doesn't work (do not re-introduce without new evidence)

| Feature | Evidence | Verdict |
|---|---|---|
| Adaptive DMA Reference | Removed from the kept minimum target | Re-introduce only through a new measured variant |
| Fear Recovery Buy | Removed from the kept minimum target | Re-introduce only through a new measured variant |
| Single-tick SPY Cross-Up Latch | Superseded by persistent latch | Cross-up day same-tick existing stable redeploy is included; later days still only absorb fresh stable |
| Buy Floor | Removed from the kept minimum target | Re-introduce only through a new measured variant |
| Broad Cross-Down Cooldown | Removed with the minimum research variants | Too blunt without new evidence |
| Broad Below-DMA Hold | Removed with the minimum research variants | Too blunt without new evidence |
| Adaptive Extreme-Fear Sizing (`FgiExponentialSizing`) | `_minus_adaptive_sizing` snapshot Δ -0.0002pp (noise floor 0.5pp) | Re-introduce only with sizing strategy showing \|Δ\| ≥ 2pp |
| Flat DMA stable gating port (`dma_fgi_portfolio_rules`) | `_minus_dma_stable_gating` improved ROI from 50.52% to 61.85% (+11.33pp when removed), Calmar +0.79 | Active only for traceability after the port; do not promote without a narrower trigger |
| Flat Greed Sell Suppression port (`dma_fgi_portfolio_rules`) | `_minus_greed_sell_suppression` improved ROI from 50.52% to 53.39% (+2.87pp when removed), Calmar +0.20 | Re-tune before retaining; blocking flat overextension sells hurt this snapshot |
| Flat ETH/BTC DMA-deviation DCA port (`dma_fgi_portfolio_rules`) | `_minus_eth_btc_deviation_dca` improved ROI from 50.52% to 53.06% (+2.54pp when removed), Calmar +0.18; 2025-05-01 was -37.19% and did not trigger the -40% tier | Re-test thresholds and symmetric ETH->BTC behavior before promotion |

Signal/noise threshold: **|Δ| < 0.5pp** = noise; **0.5pp ≤ |Δ| < 2pp** = weak signal; **|Δ| ≥ 2pp** = actionable.

Phase D note: BTC vs ETH split on 2025-04-22 in `dma_fgi_hierarchical_minimum` is BTC 0.00%, ETH 90.48%, confirming an inner-pair below-DMA allocation bug; the broad below-DMA hold variants were not viable.

## Open gaps

- No active open gap is recorded for ETH/BTC DMA-deviation rotation. The flat `eth_btc_deviation_dca` port exists and is fixture-covered, but its current attribution is negative; future work should retest threshold/symmetry variants rather than re-introducing the same rule unchanged.

## Adding a new variant

1. Append entry to relevant `*_VARIANTS` dict (e.g. `MINIMUM_HIERARCHICAL_VARIANTS`)
2. Add display name in [constants.py](./constants.py)
3. Add recipe in [strategy_registry.py](./strategy_registry.py) — set `public_params_model` and `param_family` on the `StrategyRecipe`. The catalog endpoint and runtime params routing derive from the recipe; do not edit `public_params.py`.
4. Run `sweep_production_window.py --update-snapshot`
5. Inspect snapshot diff — if |Δ| ≥ 2pp and consistent across baselines, update this file's "Current template baseline" section
6. Append entry to [ITERATION_LOG.md](./ITERATION_LOG.md)

## Conventions

- **Window**: always 500-day production window (`DEFAULT_DAYS = 500` in frontend). Yearly windows in `sweep_hierarchical.py` are **diagnostic only** — path-dependent state resets at year boundaries.
- **Snapshot fixture** (`tests/fixtures/strategy_performance_snapshot_500d.json`) `reference_date` is pinned to `2026-04-15`. Do not change without re-anchoring.
- **Naming**: `_minus_X` = leave-one-out; `_only` = isolation; `[DEPRECATED]` = excluded from default `--check`; `[RESEARCH]` = excluded from default `--check`, no production promotion.
- **Public params source of truth**: `StrategyRecipe` ([strategy_registry.py](./strategy_registry.py)). `public_params.py` does not hold strategy id lists; do not add parallel dicts or frozensets there.

> Operator commands (snapshot, attribution, validation, diagnosis): see [COMMANDS.md](./COMMANDS.md)
