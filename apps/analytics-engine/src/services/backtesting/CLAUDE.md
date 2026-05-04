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
      └── After SPY cross_up, redirect fresh stable from later sells into SPY while latch is active
```

Source files:
- [hierarchical_minimum.py](./strategies/hierarchical_minimum.py) — strategy recipe
- [hierarchical_outer_policy.py](./strategies/hierarchical_outer_policy.py) — `MinimumHierarchicalOuterPolicy` Protocol implementation
- [pair_rotation_template.py](./strategies/pair_rotation_template.py) — generic two-unit DMA-gated rotation (outer + inner reuse)

`MinimumHierarchicalOuterPolicy` has **zero dataclass fields** by design — every potential tunable was tested and removed. Don't add fields without a snapshot diff justifying it.

### Reference benchmarks

| Strategy | ROI (500d) | Notes |
|---|---|---|
| `dma_fgi_hierarchical_minimum` | 121.30% | Current target |
| `dma_fgi_eth_btc_minimum` | 145.28% | Research only — no SPY, 2-asset |
| `dma_fgi_adaptive_binary_eth_btc` | 141.21% | Production champion (no SPY) |
| `dma_fgi_hierarchical_full_minus_adaptive_dma` | 110.88% | Attribution reference |
| `dma_fgi_portfolio_rules` | 37.03% | Research only — flat portfolio-level rules |
| `dma_gated_fgi` | 25.75% | Basic DMA-gated FGI baseline |
| `dca_classic` | -14.36% | Negative baseline |

### Portfolio rules family

`dma_fgi_portfolio_rules` is the canonical flat rule-engine baseline. It keeps
the five user-facing rules in `portfolio_rules/` as portfolio-snapshot rules,
uses first-match-wins priority, and registers five leave-one-out variants in
`PORTFOLIO_RULES_ATTRIBUTION_VARIANTS`. Cross-down cooldown is per symbol:
BTC/ETH use 30 days, while SPY uses 7 days to avoid over-blackouting shallow
equity breakdowns. The 500-day fixture baseline is 37.03% ROI, 1.18 Calmar,
-21.85% MaxDD, and 78 trades. It is a traceability baseline, not a performance
target; compare rule attribution against the canonical entry.

## What works (do not regress)

Each finding is established by ROI delta from leave-one-out variants in the snapshot fixture unless explicitly marked as fixture-validated.

| Feature | Δ when removed | Established |
|---|---|---|
| DMA stable gating | **-96.96pp** ROI | `fe8db22` |
| Greed Sell Suppression | **-22.05pp** ROI | cross-validated |
| Inner ETH/BTC ratio rotation | (isolated in `dma_fgi_adaptive_binary_eth_btc` = 141.21%) | pre-existing |
| SPY macro extreme-fear DCA | Fixture-validated; included in 2026-05-04 re-anchor: ROI -0.14pp, Calmar +0.12 | 2026-05-04 |
| Persistent SPY latch | Fixture-validated fresh-stable absorption; re-anchor: ROI -0.14pp, MaxDD +0.48pp, trades -4 | 2026-05-04 |

## What doesn't work (do not re-introduce without new evidence)

| Feature | Evidence | Verdict |
|---|---|---|
| Adaptive DMA Reference | +74.26pp Δ when removed from full | Harmful; excluded at type level |
| Fear Recovery Buy | `_only` = 14.28% ROI, Calmar 0.67 | Worst non-DCA strategy |
| Single-tick SPY Cross-Up Latch | -0.69pp in full; +3.86pp in NoDMA full | Old same-tick-only latch was noise; persistent fresh-stable latch is separate and active |
| Buy Floor | +0.28pp Δ when removed (below noise) | Noise; removed at type level |
| Cross-Down Cooldown | `_cross_cooldown` = 115.35% ROI (-6.09pp), 73 trades | Harmful as a broad outer/inner constraint |
| Below-DMA Hold | `_below_dma_hold` = 20.65% ROI; `_dma_disciplined` = 19.03% ROI | Too blunt; confirmed the 2025-04-22 inner ETH allocation bug but destroyed profitable risk exposure |

Signal/noise threshold: **|Δ| < 0.5pp** = noise; **0.5pp ≤ |Δ| < 2pp** = weak signal; **|Δ| ≥ 2pp** = actionable.

Phase D note: BTC vs ETH split on 2025-04-22 in `dma_fgi_hierarchical_minimum` is BTC 0.00%, ETH 90.48%, confirming an inner-pair below-DMA allocation bug; the broad below-DMA hold variants were not viable.

## Adding a new variant

1. Append entry to relevant `*_VARIANTS` dict (e.g. `MINIMUM_HIERARCHICAL_VARIANTS`)
2. Add display name in [constants.py](./constants.py)
3. Add recipe in [strategy_registry.py](./strategy_registry.py)
4. Run `sweep_production_window.py --update-snapshot`
5. Inspect snapshot diff — if |Δ| ≥ 2pp and consistent across baselines, update this file's "Current template baseline" section
6. Append entry to [ITERATION_LOG.md](./ITERATION_LOG.md)

## Conventions

- **Window**: always 500-day production window (`DEFAULT_DAYS = 500` in frontend). Yearly windows in `sweep_hierarchical.py` are **diagnostic only** — path-dependent state resets at year boundaries.
- **Snapshot fixture** (`tests/fixtures/strategy_performance_snapshot_500d.json`) `reference_date` is pinned to `2026-04-15`. Do not change without re-anchoring.
- **Naming**: `_minus_X` = leave-one-out; `_only` = isolation; `[DEPRECATED]` = excluded from default `--check`; `[RESEARCH]` = excluded from default `--check`, no production promotion.

> Operator commands (snapshot, attribution, validation, diagnosis): see [COMMANDS.md](./COMMANDS.md)
