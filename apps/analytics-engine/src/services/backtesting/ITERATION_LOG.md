# Backtesting Strategy Iteration Log

Historical record of strategy iterations, attribution findings, and architectural decisions.
For current best template and active strategy state, see [CLAUDE.md](./CLAUDE.md).

## Entries

Newest first. Each entry: date, commit, finding, key numbers.

### 2026-05-10 - Rule-only architecture migration
- **Commit**: `4bdd93f2` + pending local change (`rule-only portfolio rules migration`)
- **Finding**: Completed the rule-only migration by adding `SpyLatchRule` as a stateful post-intent adjustment, adding `EthBtcContinuousWeightRule` for saved-config BTC/ETH rotation, rewriting `eth_btc_rotation` onto the `RuleBasedAllocationExecutor`, and deleting the hierarchical/pair-rotation strategy infrastructure.
- **Deleted infrastructure**: removed `hierarchical_minimum.py`, `hierarchical_outer_policy.py`, `hierarchical_attribution.py`, `spy_crypto_hierarchical_rotation.py`, `pair_rotation_template.py`, the hierarchical attribution sweep/diagnostic scripts, and their dedicated tests.
- **Snapshot delta vs 2026-05-09 `dma_fgi_portfolio_rules` baseline**: ROI remains 50.5217%, Calmar 3.7265, Sharpe 2.0178, MaxDD -9.3248%, trades 52. The refreshed 500-day fixture removes `dma_fgi_hierarchical_control` and `dma_fgi_hierarchical_minimum`; `eth_btc_rotation` remains 126.2611% ROI, so the rule wrapper stayed within the ±5pp saved-config tolerance.
- **SPY latch attribution**: added `dma_fgi_portfolio_rules_minus_spy_latch` after the rule-only migration. The 500-day leave-one-out is behavior-neutral vs baseline: ROI 50.5217%, Calmar 3.7265, Sharpe 2.0178, MaxDD -9.3248%, trades 52.
- **Validation events**: added `spy_latch_absorb_fresh_stable_2026_04_16` for synthetic 14-day latch absorption and `eth_btc_continuous_weight_2025_07_15` for real BTC/ETH continuous weighting. Live `analyze_compare.py` validation passes for `dma_fgi_portfolio_rules` (19 checked) and `eth_btc_rotation` (3 checked).
- **Known issue carried forward**: `dma_stable_gating`, `greed_sell_suppression`, and `eth_btc_deviation_dca` still have negative leave-one-out attribution in the flat first-match engine. Next iteration should retune DMA stable gating to an event-driven trigger, revisit greed suppression interaction with overextension sells, and lower/fixture the ETH/BTC deviation DCA thresholds.

### 2026-05-09 - Flat portfolio-rule hierarchical behavior ports
- **Commit**: `065860d8` + pending local change (`dma_fgi_portfolio_rules` rule ports)
- **Finding**: Ported `dma_stable_gating`, `greed_sell_suppression`, and `eth_btc_deviation_dca` into the canonical flat portfolio-rule engine with leave-one-out attribution variants. The implementation is traceable and fixture-covered, but the 500-day snapshot says all three ports are harmful in the current flat-rule form.
- **Snapshot delta vs prior `dma_fgi_portfolio_rules` baseline**: ROI 67.6831% -> 50.5217% (-17.1614pp), Calmar 4.9129 -> 3.7265 (-1.1864), MaxDD unchanged at -9.3248%, trades 56 -> 52 (-4). The task brief referenced a 64.10% baseline, but the local pre-change snapshot was already 67.6831% from later pending iterations.
- **Leave-one-out attribution vs new baseline**: `_minus_dma_stable_gating` ROI 61.8548% (+11.3331pp when removed), Calmar +0.7864, trades +3; `_minus_greed_sell_suppression` ROI 53.3945% (+2.8728pp), Calmar +0.2021, trades +3; `_minus_eth_btc_deviation_dca` ROI 53.0608% (+2.5391pp), Calmar +0.1775, trades +7. Since removal improves ROI by at least 2pp for all three, each port fails the retention threshold as implemented.
- **Validation events**: added/updated `tests/fixtures/hierarchical_validation_events.json` events `greed_sell_suppression_2024_12_02`, `dma_stable_gating_2025_03_13`, and `eth_btc_deviation_dca_to_eth_2025_04_07`; relaxed `eth_cross_down_preserve_spy_2025_11_06` action matching because flat DMA stable gating can now surface a sell intent there.
- **2025-05-01 audit**: ETH/BTC ratio distance was -37.1915%, below the -40% DCA trigger, so `dma_fgi_portfolio_rules` correctly held on that date. The low-side deviation DCA fixture uses 2025-04-07, where the threshold is actually crossed.
- **Decision**: keep these ports only as explicit canonical-strategy behavior under review; do not promote them as proven improvements without narrower triggers, threshold tuning, or disabling the harmful pieces.

### 2026-05-08 — Portfolio rule cooldowns localized
- **Commit**: pending local change (`dma_fgi_portfolio_rules` per-rule cooldown)
- **Finding**: The shared post-trade portfolio cooldown gate was removed because it let a cross-down sell suppress short-lived extreme-fear DCA opportunities. Portfolio rules now expose rule-local cooldown fields, defaulting to 0d, and cooldown state is recorded only after an executed transfer.
- **Regression pins**: strategy coverage verifies a cross-down sell no longer blocks the next extreme-fear DCA, and custom per-rule cooldown skips only the cooling rule after actual execution.
- **Validation**: `dma_fgi_portfolio_rules` hierarchical validation passes with `extreme_fear_dca_2025_03_11` PASS; 500-day strategy snapshot reports no metric drift above tolerance.

### 2026-05-07 — Risk layer extraction and adaptive sizing audit trail
- **Commit**: pending local change (`phase4-risk-sizing`)
- **Finding**: Moved `trade_quota` and `dma_buy_gate` from portfolio-rule wrappers into post-decision `risk/` guards while preserving the old priority semantics, then added `SizingStrategy` with flat defaults and canonical `FgiExponentialSizing(max_multiplier=1.1)` for extreme-fear buys.
- **Snapshot delta vs flat sizing ablation**: `dma_fgi_portfolio_rules` ROI 64.0972% -> 64.0974% (+0.0002pp), Calmar 4.2665 -> 4.2665 (+0.0000), Sharpe 1.9112 -> 1.9069 (-0.0043), MaxDD unchanged at -10.2024%, trades 48 -> 48 (0). `_minus_adaptive_sizing` preserves the Phase B flat baseline.
- **Audit trail**: `decisions.jsonl` now emits `sizing_meta` for DCA step rules. Phase B flat decisions show `base == adjusted`; Phase C adaptive extreme-fear buys show `strategy=fgi_exponential`, FGI value, and `base != adjusted`.
- **Validation**: `tests/test_validation_events.py` passed after both Phase B and Phase C. Full `pnpm --filter @zapengine/analytics-engine test` remains blocked locally by a corrupted Docker test container (`analytics-test-postgres` returns containerd input/output errors), not by pytest failures.

### 2026-05-07 — Portfolio rules hierarchical-feature port stopped at DMA stable gating
- **Commit**: pending local change (`dma_fgi_portfolio_rules` priority-spacing setup)
- **Finding**: Phase 0 priority spacing was behavior-neutral after preserving the existing optional `dma_buy_gate` order after overextension sells. Phase 1's direct flat translation of DMA stable gating (`BTC/ETH below DMA` + crypto FGI in `fear/extreme_fear` -> route to stable) had the wrong sign and was reverted per the stop condition. The ablation proved isolation, but the trigger was too broad in the flat rule layer and blocked profitable extreme-fear DCA exposure.
- **Snapshot result**: Phase 0 baseline remained `dma_fgi_portfolio_rules` ROI 64.10%, Calmar 4.27, 48 trades. The reverted Phase 1 candidate fell to ROI 21.76%, Calmar 1.51, 33 trades, while `_minus_dma_stable_gating` returned to ROI 64.10%, Calmar 4.27, 48 trades.
- **Next**: Reassess the source behavior before trying another port. The profitable hierarchical "DMA stable gating" appears tied to outer DMA intent composition, not the broad below-DMA fear/extreme-fear crypto blocker tested here.

### 2026-05-07 — Cross-up cooldown restored and validation trigger assets
- **Commit**: pending local change (`dma_fgi_portfolio_rules` cooldown validation follow-up)
- **Finding**: Reverted the raw `cross_event` re-entry bypass introduced in the 2026-05-06 iteration: `cross_up_equal_weight` now requires `actionable_cross_event == "cross_up"` and emits `portfolio_rule_trigger_assets` so hierarchical observation diagnostics select the actual cross-triggering asset. `analyze_compare.py` now marks cross-down validation events as `SKIPPED` when the reference asset was already at zero in the previous explicit target allocation.
- **Snapshot delta vs 55.02% / 47 trades / 3.20 Calmar baseline**: ROI 55.02% → 64.31% (+9.29pp), Calmar 3.20 → 4.28 (+1.09), Sharpe 1.63 → 1.90 (+0.27), MaxDD -11.80% → -10.20% (+1.59pp), trades 47 → 47 (0).
- **Validation events**: Targeted `dma_fgi_portfolio_rules` checks now resolve `btc_cross_down_2025_03_08` as `SKIPPED`, `cooldown_period_2025_03_24` as `PASS`, and `eth_cross_up_2025_06_09` as `PASS`. The full fixture still has unrelated pre-existing failures in other event families.

### 2026-05-06 — Portfolio cross semantics and analyzer output cleanup
- **Commit**: pending local change (`dma_fgi_portfolio_rules` fixture semantics + `analyze_compare.py` CLI cleanup)
- **Finding**: Portfolio cross-down exits now liquidate BTC/ETH as one crypto peer group while preserving SPY, and SPY-only cross-down remains SPY-scoped. Cross-up equal-weight now treats a same-day raw cross-up as eligible even when the previous cross-down cooldown still marks the above zone blocked, allowing stable to redeploy on the explicit cross-up signal.
- **Analyzer cleanup**: `analyze_compare.py` no longer exposes output-section profiles; default output renders all sections and `--section` remains the explicit subset mechanism. Markdown `--out` paths are resolved to absolute paths, emit a save notice, and write fallback markdown when markdown rendering fails after constraint validation is available.
- **Snapshot result**: 500-day `dma_fgi_portfolio_rules` snapshot check reports no metric drift above tolerance; the traceability baseline remains ROI 55.02%, Calmar 3.20, MaxDD -11.80%, and 47 trades.
- **Validation events**: `btc_cross_down_preserve_spy_2025_10_18` and `spy_cross_up_redeploy_2026_04_08` pass as targeted live API constraint checks for `dma_fgi_portfolio_rules`.

### 2026-05-05 — Portfolio rules atomic execution
- **Commit**: pending local change (`dma_fgi_portfolio_rules` rule-based executor)
- **Finding**: `dma_fgi_portfolio_rules` now uses `RuleBasedAllocationExecutor`, so each matched portfolio rule executes the full target-allocation delta on the same bar instead of routing through `FgiExponentialPacingPolicy` and multi-step ramps. The legacy allocation executor, pacing policy, and execution plugins remain untouched for the other strategies.
- **Rule migration**: DMA buy-side sideways confirmation and trade quotas moved into portfolio-rule hold guards for this strategy only. The executor owns `last_trade_date`/`trade_dates`, and the decision policy reads them through `PortfolioSnapshot`.
- **Snapshot delta vs previous `dma_fgi_portfolio_rules` baseline**: ROI 33.08% → 55.02% (+21.94pp), Calmar 1.02 → 3.20 (+2.17), Sharpe 0.87 → 1.63 (+0.75), MaxDD -22.63% → -11.80% (+10.83pp), trades 51 → 47 (-4).
- **Regression pins**: unit coverage verifies atomic full-delta transfers, cost-model handoff, buy-gate holds, trade-quota holds, and strategy wiring. The 2025-03-24 validation event passes, and the research-inclusive 500-day snapshot re-anchor shows drift only in the portfolio-rules family before update.

### 2026-05-05 — SPY portfolio cross-down cooldown aligned to 30d
- **Commit range**: `38ae5e3..3cf9464` plus this snapshot/docs update.
- **Finding**: `dma_fgi_portfolio_rules` now feeds per-symbol cross-down cooldowns into the flat minimum DMA engines with BTC/ETH/SPY all at 30d by default. Later iterations removed the separate shared post-trade DCA gate in favor of rule-local cooldowns.
- **Snapshot delta vs SPY-7 `dma_fgi_portfolio_rules` baseline**: ROI 37.03% → 33.08% (-3.95pp), Calmar 1.18 → 1.02 (-0.16), Sharpe 0.91 → 0.87 (-0.04), MaxDD -21.85% → -22.63% (-0.78pp), trades 78 → 51 (-27).
- **Regression pins**: unit coverage locks the cooldown lookup defaults and custom fallback; strategy coverage verifies SPY and BTC remain cooldown-blocked across the default window. The 2025-03-24 validation event now checks that cooldown-blocked cross-up equal-weight re-entry does not match while allowing hold targets to preserve existing SPY exposure from prior validated DCA. A synthetic 2025-07-15 ETH/BTC ratio cross-up test pins the complete BTC→ETH rotation behavior.

### 2026-05-04 — Portfolio cross-down cooldown gating
- **Commit**: pending local change on `57be82e` (`dma_fgi_portfolio_rules` cross-down cooldown)
- **Finding**: Portfolio cross rules now consume `actionable_cross_event`, and the DMA signal engine now suppresses actionable crosses whose target zone is still cooldown-blocked. This makes the existing 30-day cross cooldown effective for `dma_fgi_portfolio_rules`: after a cross-down commits, raw cross-up observations can still appear, but they are not actionable until the blocked-side cooldown has cleared.
- **Snapshot delta vs previous `dma_fgi_portfolio_rules` baseline**: ROI 9.37% → 29.73% (+20.36pp), Calmar 0.29 → 1.33 (+1.03), Sharpe 0.40 → 0.99 (+0.59), MaxDD -22.83% → -15.73% (+7.10pp), trades 102 → 82 (-20).
- **Attribution sanity**: `_minus_cross_up_eq_weight` remains near the old risk-managed reference at 10.02% ROI / 1.02 Calmar / 71 trades, confirming the cooldown keeps cross-up exposure selective rather than removing the rule outright. `_minus_cross_down_exit` falls to 8.97% ROI, so the cross-down exit remains valuable once whipsaw re-entry is blocked.

### 2026-05-04 — Flat portfolio-rule engine
- **Commit**: this commit (`dma_fgi_portfolio_rules` research baseline + attribution variants)
- **Finding**: Added a portfolio-level rule layer parallel to asset-local tactics. The canonical strategy evaluates the five flat rules first-match-wins: cross-down exits, cross-up equal-weight, extreme-fear DCA buy, DMA-overextension DCA sell, and FGI-downshift DCA sell. Each rule has its own file and a leave-one-out strategy id for snapshot attribution.
- **Result**: `dma_fgi_portfolio_rules` ROI = 9.37%, Calmar 0.29, MaxDD -22.83%, 102 trades.
- **Attribution sanity**: leave-one-out ROI deltas vs canonical are cross-down exit -0.70pp, cross-up equal-weight -0.51pp, extreme-fear buy -0.39pp, overextension sell +1.91pp, and FGI-downshift sell -0.05pp. The v1 goal is traceability, not beating `dma_fgi_hierarchical_minimum`.
- **Comparison**: vs `dma_fgi_hierarchical_minimum` (121.30% ROI), -111.93pp ROI; vs `dma_fgi_eth_btc_minimum` (145.28% ROI), -135.91pp ROI.

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
