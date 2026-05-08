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
  ├── Feature 1: DMA stable gating
  │   └── When crypto < CRYPTO_DMA in fear regime → lift to stable
  ├── Feature 2: Greed Sell Suppression
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
| `dma_fgi_portfolio_rules` | 64.10% | Flat rule-engine + adaptive extreme-fear sizing |
| `dma_fgi_portfolio_rules_minus_adaptive_sizing` | 64.10% | Flat sizing baseline |
| `dma_fgi_portfolio_rules_minus_cross_down_exit` | 27.80% | Portfolio rules leave-one-out |
| `dma_fgi_portfolio_rules_minus_cross_up_eq_weight` | 10.69% | Portfolio rules leave-one-out |
| `dma_fgi_portfolio_rules_minus_extreme_fear_buy` | 65.25% | Portfolio rules leave-one-out |
| `dma_fgi_portfolio_rules_minus_overextension_sell` | 51.24% | Portfolio rules leave-one-out |
| `dma_fgi_portfolio_rules_minus_fgi_downshift_sell` | 64.61% | Portfolio rules leave-one-out |
| `eth_btc_rotation` | 126.26% | Saved-config live default |
| `dma_fgi_hierarchical_control` | 88.64% | Attribution baseline |
| `dma_fgi_hierarchical_minimum` | 121.30% | Current production target |
| `dma_fgi_eth_btc_minimum_surgical` | 48.97% | Surgical composer research line |

### Portfolio rules family

`dma_fgi_portfolio_rules` is the canonical flat rule-engine baseline. It keeps
the seven user-facing strategy rules in `portfolio_rules/` as portfolio-snapshot
rules, then applies post-decision risk guards from `risk/` before atomic
execution through `RuleBasedAllocationExecutor`. Extreme-fear buys use
`FgiExponentialSizing(max_multiplier=1.1)` and emit `sizing_meta` in
`decisions.jsonl`; `_minus_adaptive_sizing` preserves the flat-sizing baseline.
Cross-down cooldown is per symbol: BTC/ETH/SPY use 30 days by default. The
500-day fixture baseline is 64.10% ROI, 4.27 Calmar, -10.20% MaxDD, and 48
trades. It is a traceability baseline, not a performance target; compare rule
attribution against the canonical entry.

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

The pytest gate (`pnpm test`) runs `tests/test_validation_events.py` against all 11 kept strategies on every commit. If a validation event regresses, the commit fails CI before snapshot or ROI checks even run.

## What works (do not regress)

Each finding is established by ROI delta from leave-one-out variants in the snapshot fixture unless explicitly marked as fixture-validated.

| Feature | Δ when removed | Established |
|---|---|---|
| DMA stable gating | **-96.96pp** ROI | `fe8db22` |
| Greed Sell Suppression | **-22.05pp** ROI | cross-validated |
| Inner ETH/BTC ratio rotation | `eth_btc_rotation` = 126.26% ROI | pre-existing |
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

Signal/noise threshold: **|Δ| < 0.5pp** = noise; **0.5pp ≤ |Δ| < 2pp** = weak signal; **|Δ| ≥ 2pp** = actionable.

Phase D note: BTC vs ETH split on 2025-04-22 in `dma_fgi_hierarchical_minimum` is BTC 0.00%, ETH 90.48%, confirming an inner-pair below-DMA allocation bug; the broad below-DMA hold variants were not viable.

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
