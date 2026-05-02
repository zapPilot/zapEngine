# Backtesting Strategy Iteration Log

Historical record of strategy iterations, attribution findings, and architectural decisions.
For current best template and active strategy state, see [CLAUDE.md](./CLAUDE.md).

## Entries

Newest first. Each entry: date, commit, finding, key numbers.

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
