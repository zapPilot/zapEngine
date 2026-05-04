# Backtesting Strategy Iteration Log

Historical record of strategy iterations, attribution findings, and architectural decisions.
For current best template and active strategy state, see [CLAUDE.md](./CLAUDE.md).

## Entries

Newest first. Each entry: date, commit, finding, key numbers.

### 2026-05-04 — SPY macro extreme fear + persistent SPY latch
- **Commit**: this commit (`dma_fgi_hierarchical_minimum` production behavior re-anchor)
- **Finding**: Added fixture-backed crypto extreme-fear DCA dates, introduced a SPY-side macro extreme-fear DCA rule using CNN macro F&G plus SPY DMA, and promoted the SPY latch from same-tick-only behavior to persistent fresh-stable absorption while the latch remains active. The 500-day minimum baseline stays inside the ROI noise band while improving risk-adjusted metrics, so the snapshot was re-anchored.
- **Snapshot delta vs previous `dma_fgi_hierarchical_minimum` baseline**: ROI 121.44% → 121.30% (-0.14pp), Calmar 4.50 → 4.63 (+0.12), Sharpe 1.91 → 1.98 (+0.07), MaxDD -17.46% → -16.97% (+0.48pp), trades 85 → 81 (-4).
- **Validation events**: new constraints pass for crypto extreme-fear DCA on 2025-03-11 and 2025-04-07, SPY macro extreme-fear DCA on 2025-03-13 and 2025-04-08, and persistent latch absorption on 2025-05-24. Proposed 2025-03-09/2025-03-03 were shifted because the trigger gates did not resolve to crypto extreme fear / SPY below-DMA respectively.

### 2026-05-03 — Flat minimum baseline
- **Commit**: this commit (`dma_fgi_flat_minimum` research baseline + sweep)
- **Rationale**: Break the strategy out of the hierarchical outer SPY/crypto sleeve and inner BTC/ETH ratio framework while preserving the minimum stack's event-driven DMA semantics. The flat baseline removes outer/inner gating, adaptive crypto DMA reference selection, ETH/BTC ratio rotation, and target composers; each of SPY/BTC/ETH gets its own DMA-200 gate. Cross-down sells only the triggering asset to stable, explicit buy intents redeploy existing stable, and no-signal days preserve the current allocation.
- **Result**: `dma_fgi_flat_minimum` ROI = 24.04%, Calmar 0.93, MaxDD -18.31%, 55 trades.
- **Comparison**:
  - vs `dma_fgi_hierarchical_minimum` (121.44% ROI, 4.50 Calmar, -17.46% MaxDD, 85 trades): -97.40pp ROI, -3.57 Calmar, 0.85pp deeper drawdown, -30 trades.
  - vs `dma_fgi_eth_btc_minimum` (145.28% ROI, 4.46 Calmar, -20.72% MaxDD, 51 trades): -121.24pp ROI, -3.53 Calmar, 2.41pp shallower drawdown, +4 trades.
- **Validation note**: `analyze_compare.py` on 2025-02-02 now passes `eth_cross_down_2025_02_02` for `dma_fgi_flat_minimum`: `target_allocation.eth = 0.0`, portfolio ETH = 0.0, and stable rises to ~72.11%.

### 2026-05-02 - SPY tax fix attempt: DMA-discipline variants (Phase D)
- **Commit**: this commit (DMA cooldown/below-DMA research variants + sweep)
- **D-1 finding**: BTC vs ETH split on 2025-04-22 in `dma_fgi_hierarchical_minimum` is BTC 0.00%, ETH 90.48%, SPY 9.52%, stable 0.00%; inner-pair fix needed yes.
- **Variants**:
  - `dma_fgi_hierarchical_minimum_cross_cooldown`: 30-day actionable cross-down cooldown for SPY/BTC/ETH allocation increases.
  - `dma_fgi_hierarchical_minimum_below_dma_hold`: no allocation increase while SPY/BTC/ETH is below its own DMA, with extreme-fear DCA carve-out.
  - `dma_fgi_hierarchical_minimum_dma_disciplined`: both constraints together.
- **Results vs `dma_fgi_hierarchical_minimum` baseline (121.44% ROI, 85 trades)**:
  - `_cross_cooldown`: ROI 115.35%, delta -6.09pp, trades 73 (delta -12)
  - `_below_dma_hold`: ROI 20.65%, delta -100.79pp, trades 89 (delta +4)
  - `_dma_disciplined`: ROI 19.03%, delta -102.41pp, trades 88 (delta +3)
- **Validation events**: `validate_hierarchical_events.py --all-strategies` passes; `extreme_fear_dca_*` remain pass for all new variants. The BTC cross-down SPY-preservation assertion now allows a 1e-5 numeric tolerance for share-level normalization noise.
- **Diagnostic**: combined variant reduces divergence events from 27 to 18, but destroys profitable risk exposure; remaining pattern verdict is S1.
- **Verdict**: no fix. The constraints are too blunt; below-DMA hold converts the confirmed 2025-04-22 inner-pair bug into a broad risk-off drag rather than closing the 23.84pp SPY-tax gap.
- **Next**: Phase E should isolate the inner BTC/ETH DMA correctness gap without applying outer below-DMA hold globally; also revisit a direct S2 composition constraint or ETH max-down logic separately.

### 2026-05-02 - SPY tax fix attempt: S1/S4 targeted variants
- **Commit**: this commit (targeted S1/S4 research variants + sweep)
- **Variants**:
  - `dma_fgi_hierarchical_minimum_dma_buffer`: S1 test; requires 3% above-DMA distance before above-DMA DMA buy entries.
  - `dma_fgi_hierarchical_minimum_dual_above_hold`: S4 test; holds the current outer allocation while both SPY and crypto are above DMA.
- **Results vs `dma_fgi_hierarchical_minimum` baseline (121.44% ROI, 85 trades)**:
  - `_dma_buffer`: ROI 121.49%, delta +0.05pp, trades 85 (delta 0)
  - `_dual_above_hold`: ROI 107.69%, delta -13.74pp, trades 72 (delta -13)
- **Validation**: `validate_hierarchical_events.py --all-strategies` now includes both research variants; all expected hierarchical events pass.
- **Verdict**: fix failed. Best variant is below 125% ROI, so neither pre-designed S1 nor S4 modifier recovers the 23.84pp SPY tax.
- **Next**: re-run diagnosis with finer instrumentation around stable-vs-SPY allocation and post-sell redeploy timing. The first diagnosis correctly identified weak SPY events and oscillation, but these simple gates did not isolate the return leak.

### 2026-05-02 - SPY tax pattern diagnosis
- **Commit**: `8ab4485` (SPY tax diagnostic tooling)
- **Diagnostic**: `apps/analytics-engine/docs/diagnostics/spy_tax_2026-04-15.md`
- **Pattern verdict**: S1 + S4
- **Key statistics**:
  - Total divergence events: 27
  - SPY entries with negative 5-day forward return: 50.0%
  - Median crypto-cut size at SPY entry: 0.00 percentage points
  - Oscillation count (entry+exit within 7 days): 8
  - Total "regret" (forward crypto return lost across SPY entries): 1.80 percentage points
- **Interpretation**: The SPY tax is primarily false-positive/whipsaw allocation, not a coarse crypto haircut. SPY entries have weak short-term follow-through and 8 of 14 entries reverse within a week, while the median crypto-cut size is 0.00pp. That supports S1 and S4, and does not support S2 as the main driver.
- **Next**: Phase C will build variants targeting S1 and S4 specifically.

### 2026-05-02 — SPY tax decomposed via `dma_fgi_eth_btc_minimum`
- **Commit**: `05326af` (eth_btc_minimum research variant + sweep)
- **Hypothesis**: 19.77pp gap between `dma_fgi_adaptive_binary_eth_btc` (141.21%) and `dma_fgi_hierarchical_minimum` (121.44%) is a mix of SPY constraint cost / outer architecture cost / context-dependent greed_sell_suppression
- **Result**: `dma_fgi_eth_btc_minimum` ROI = 145.28%, Calmar 4.46, MaxDD -20.72%, 51 trades
- **Interpretation (Branch 2)**: Greed Sell Suppression is **universal positive** (+4.07pp in 2-asset vs adaptive_binary 141.21%). SPY tax is **23.84pp** (= 145.28 - 121.44), larger than first estimated. SPY tax is **architecture-induced, not asset-induced** — `hierarchical_minimum` executes 33 more trades than the 2-asset version (84 vs 51), strongly suggesting outer SPY/crypto switching is over-active and mistimes asset transitions.
- **Next iteration target**: diagnose SPY/crypto switch timing in outer pair-template. Suspects: outer DMA gating threshold too aggressive, composition formula shrinks crypto share too fast when SPY rises, symmetric DMA200 windows ignore asset volatility differences, no "both-above-DMA hold" rule (oscillates between SPY and crypto).

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
