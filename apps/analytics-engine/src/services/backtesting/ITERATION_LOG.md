# Backtesting Strategy Iteration Log

Historical record of strategy iterations, attribution findings, and architectural decisions.
For current best template and active strategy state, see [CLAUDE.md](./CLAUDE.md).

## Entries

Newest first. Each entry: date, commit, finding, key numbers.

### 2026-05-14 - Promote R4-aggressive DMA overextension sentiment multipliers
- **Status**: active
- **Commit**: pending local change (`promote R4-aggressive overextension defaults`)
- **Promoted**: `dma_overextension_dca_sell` now defaults to `overextension_threshold_multiplier_greed=0.50` and `overextension_threshold_multiplier_extreme_greed=0.33` across the rule dataclass, `DmaGatedFgiParams`, and nested public `top_escape` params. Explicit saved config values still override these defaults.
- **Production-window gate**: `scripts/attribution/sweep_production_window.py` passed the promotion bar before snapshot refresh. Full-default `dma_fgi_portfolio_rules` moved from ROI `71.7135%` to `76.8826%` (`+5.1691pp`), Calmar `5.1864` to `5.7841` (`+0.5977`), and Sharpe `2.4741` to `2.6274` (`+0.1533`). Current refreshed snapshot trade count is `53`; max drawdown is `-8.9254%`.
- **Per-rule report**: `dma_overextension_dca_sell` is now `295` matches, `108` wins, `7` shadowed. Other active rules: `fgi_downshift_dca_sell` `22/10/7`, `eth_btc_deviation_dca` `19/3/0`, `cross_down_exit` `7/5/0`, `cross_up_equal_weight` `4/4/0`, `eth_btc_ratio_rotation` `3/3/0`, `spy_latch` `0/0/0`.
- **Shadowing check**: `dma_overextension_dca_sell` shadows `fgi_downshift_dca_sell` `6` times; it is shadowed by `eth_btc_deviation_dca` `3`, `cross_down_exit` `2`, `cross_up_equal_weight` `1`, and `eth_btc_ratio_rotation` `1`. No adverse crowd-out showed up in the production gate because ROI, Calmar, and Sharpe all improved.
- **Validation**: hierarchical validation events passed `14/14` with no fixture updates. `test_dma_overextension_dca_sell.py` was updated red-first so the new default greed threshold behavior is covered. `sweep_production_window.py --update-snapshot` refreshed `tests/fixtures/strategy_performance_snapshot_500d.json` and regenerated the landing-page equity curve.

### 2026-05-13 - R4 sentiment-modulated DMA overextension threshold
- **Status**: active
- **Commit**: pending local change (`dma_overextension_dca_sell R4 opt-in multipliers`)
- **Implemented**: added opt-in `top_escape` public params for `overextension_threshold_multiplier_greed` and `overextension_threshold_multiplier_extreme_greed`, wired them through `DmaGatedFgiParams`, `decision_policy._rule_for_params`, and `rule_only_sweep.py` CLI flags. `DmaOverextensionDcaSellRule` now multiplies the asset-specific DMA overextension threshold only in `greed` and `extreme_greed`; all other regimes use the existing threshold.
- **Behavior guard**: both multipliers default to `1.0`, so default `dma_overextension_dca_sell` behavior and the 500-day snapshot fixture are unchanged.
- **500-day rule-only sweep vs current overextension baseline**:
  | Variant | Greed mult | Extreme greed mult | ROI | ROI Delta | Calmar | Calmar Delta | Sharpe | Sharpe Delta | Trades | Matches | Decision |
  | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
  | baseline | 1.00 | 1.00 | 66.7972 | 0.0000 | 4.4323 | 0.0000 | 1.9653 | 0.0000 | 38 | 236 | baseline |
  | R4-mild | 0.80 | 0.67 | 68.1024 | 1.3052 | 4.5134 | 0.0811 | 1.9664 | 0.0011 | 44 | 262 | pass |
  | R4-recommended | 0.67 | 0.50 | 68.4751 | 1.6779 | 4.7206 | 0.2883 | 1.9138 | -0.0515 | 47 | 281 | pass |
  | R4-aggressive | 0.50 | 0.33 | 71.9107 | 5.1135 | 4.9435 | 0.5112 | 2.0451 | 0.0798 | 49 | 296 | promote in follow-up |
  | R4-greed-only | 0.67 | 1.00 | 66.7564 | -0.0408 | 4.6094 | 0.1771 | 1.9408 | -0.0245 | 47 | 274 | reject |
  | R4-extreme-only | 1.00 | 0.50 | 71.3075 | 4.5103 | 4.7121 | 0.2798 | 1.9462 | -0.0191 | 39 | 243 | pass but dominated |
- **Decision**: sentiment + overextension are not collinear at the threshold level. The response is monotonic across mild -> recommended -> aggressive, and R4-aggressive clears the +1pp ROI bar while improving Sharpe. Per the implementation scope, defaults remain `1.0` in this change; promote `0.50` / `0.33` in a separate default-change plus snapshot-refresh commit if accepted.
- **Wiring note**: `--overextension-multiplier-extreme-greed 0.5` changed ROI from 66.7972% to 71.3075% in the extreme-only run, proving the CLI/public-param/decision-policy/rule path is live.
- **Validation**: targeted red-green tests passed (`43 passed` after implementation). `pnpm --filter @zapengine/analytics-engine type-check` passed. `pnpm --filter @zapengine/analytics-engine lint` passed. `uv run pytest tests/services/backtesting tests/scripts tests/api` passed 865 tests. `pnpm --filter @zapengine/analytics-engine test:strategy-snapshot:fast` reported zero 500-day snapshot drift. No `--update-snapshot`.

### 2026-05-13 - Cross-up sentiment filter and drawdown amplifier opt-in
- **Status**: active
- **Commit**: pending local change (`cross_up_equal_weight R1/R2 opt-in params`)
- **Implemented**: added `peak_distance_60d` to `DmaMarketState`, computed from asset-specific `SignalContext.price_history[-60:]`; added `StrategyContext.price_history_map` so flat SPY/BTC/ETH signals do not reuse BTC history for SPY/ETH; added opt-in `cross_up` public params for `fgi_slope_min`, `drawdown_amplifier_alpha`, and `drawdown_amplifier_threshold`; wired them through `DmaGatedFgiParams`, `decision_policy._rule_for_params`, and `rule_only_sweep.py` CLI flags.
- **Behavior guard**: with `fgi_slope_min=None` and `drawdown_amplifier_alpha=None`, `cross_up_equal_weight` keeps the old equal-weight behavior. The drawdown threshold is inert unless alpha is set.
- **500-day rule-only sweep vs current cross_up baseline**:
  | Variant | fgi_slope_min | drawdown_alpha | ROI | ROI Delta | Calmar | Calmar Delta | Sharpe | Trades | Matches | Decision |
  | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
  | baseline | - | - | 55.4133 | 0.0000 | 2.3006 | 0.0000 | 1.2962 | 9 | 4 | baseline |
  | R1 slope >= 0 | 0.0 | - | 55.4133 | 0.0000 | 2.3006 | 0.0000 | 1.2962 | 9 | 4 | reject: no effect |
  | R1 slope >= 0.05 | 0.05 | - | 31.1461 | -24.2672 | 0.9893 | -1.3113 | 0.7604 | 4 | 0 | reject: too tight |
  | R2 alpha=0.5 | - | 0.5 | 55.4133 | 0.0000 | 2.3006 | 0.0000 | 1.2962 | 9 | 4 | reject: no effect |
  | R2 alpha=1.0 | - | 1.0 | 55.4133 | 0.0000 | 2.3006 | 0.0000 | 1.2962 | 9 | 4 | reject: no effect |
  | R1+R2 | 0.0 | 0.5 | 55.4133 | 0.0000 | 2.3006 | 0.0000 | 1.2962 | 9 | 4 | reject: no effect |
- **Decision**: do not promote either enhancement to default. R1 with threshold 0.0 is redundant with the observed cross-up events in this window; 0.05 suppresses all four matches and damages performance. R2 is wired but behavior-neutral at the default 20% drawdown threshold, so the eligible cross-up assets do not get amplified in this window.
- **Wiring note**: the requested `--cross-up-fgi-slope-min 0.0` live check did not produce different metrics because all four baseline cross-up matches already pass that threshold. `--cross-up-fgi-slope-min 0.05` changed results, proving R1 wiring is live. R2 unit coverage proves sizing changes when `peak_distance_60d` breaches threshold, but the 500-day production window did not breach the 20% threshold on eligible assets.
- **Validation**: `pnpm --filter @zapengine/analytics-engine type-check` passed. `pnpm --filter @zapengine/analytics-engine lint` passed. `uv run pytest tests/services/backtesting tests/scripts tests/api` passed 857 tests. `pnpm --filter @zapengine/analytics-engine test:strategy-snapshot:fast` reported zero 500-day snapshot drift. No `--update-snapshot`.
- **Next**: keep R1/R2 as opt-in research params only. If revisiting R2, test a lower drawdown threshold or different peak-distance window before promoting any default.

### 2026-05-13 - Extreme-fear buy_step sweep and structural root cause
- **Status**: active
- **Commit**: pending local change (`extreme-fear buy_step variant sweep`)
- **Plumbed**: added `buy_step` to `_ExtremeFearPublicParams` and `DmaGatedFgiParams`, wired it through `decision_policy._rule_for_params`, and added `--buy-step` to `scripts/attribution/rule_only_sweep.py` so sizing of `extreme_fear_dca_buy` can be tested without code edits.
- **User hypothesis**: 2026-02-06 BTC $62,854 and 2025-11-22 BTC $85,052 were local lows in extreme-fear cycles, so increasing `buy_step` from 0.01 to 0.20 / 0.50 with `min_consecutive_extreme_fear_days=5..7` should let the rule capture them and turn the standalone delta positive.
- **Size sweep vs minimal-baseline standalone**:
  | N | buy_step | ROI | ROI Delta | Calmar | Sharpe | Matches | Decision |
  | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
  | disabled baseline | - | 55.4133 | 0.0000 | 2.3006 | 1.2962 | 0 | baseline |
  | 7 | 0.01 | 55.3616 | -0.0517 | 2.2986 | 1.2948 | 21 | reject |
  | 7 | 0.20 | 47.7208 | -7.6925 | 1.3727 | 1.0550 | 21 | reject |
  | 7 | 0.50 | 36.7060 | -18.7073 | 0.8795 | 0.8183 | 16 | reject |
  | 5 | 0.20 | 42.8776 | -12.5357 | 1.1545 | 0.9794 | 34 | reject |
  | 5 | 0.50 | 28.4453 | -26.9680 | 0.6143 | 0.6907 | 27 | reject |
- **Decision-log trace (full default, 2026-01-01 to 2026-04-15)**: the only executed buy is `cross_up_equal_weight` on 2026-04-08 routing 100% into SPY. BTC stays at 0% throughout 2026. All sell-side trades are `dma_overextension_dca_sell` trickling SPY into stable plus a 2026-03-20 `cross_down_exit` cleanup before the SPY redeploy.
- **Supabase price verification**: BTC stays below DMA-200 from 2025-10 through 2026-05-12. DMA glides from $108k to $82k while spot drops from $94k to $80k. The 2026-04-08 `cross_up_equal_weight` is driven by SPY (not BTC) regaining its own DMA; `cross_up_equal_weight` then weights only above-DMA assets, force-rotating any held BTC into SPY at $71,975.
- **Root cause**: scaling sizing makes the rule worse because increasing `buy_step` deploys more capital into BTC during persistent below-DMA periods, and the next portfolio-level cross_up forces those BTC bags to liquidate at a loss into SPY. Example: 2025-11-22 N=7 entry at $85,052 → 2026-04-08 forced sale at $71,975 ≈ -15.4% on the deployed slice, dominating the small +2.0%/+6.5% wins from the 2026-02 cycle entries. As of 2026-05-12, BTC at $80,791 is still below the 2025-11 entry, so even holding through 2026-05 does not recover the loss.
- **Cleanup**: `buy_step` plumbing and `--buy-step` flag stay in place for future hybrid-trigger work (e.g., FGI + price drawdown gate). Rule remains in `_NON_DEFAULT_PORTFOLIO_RULES`; integration tests covering the rule remain `@pytest.mark.skip(reason="extreme_fear_dca_buy rule is not default-enabled")`.
- **Validation**: `pnpm --filter @zapengine/analytics-engine type-check` passes (202 source files). `uv run pytest tests/services/backtesting tests/scripts tests/api/test_v3_strategy.py` passes 668 / skips 5. Snapshot fixture is unchanged. No `--update-snapshot`.
- **Next**: if revisiting extreme-fear entries, change the trigger entirely (e.g., require BTC's own DMA distance to be deep below + price drawdown threshold) rather than tuning N or sizing. Alternatively, redesign `cross_up_equal_weight` so it does not force-liquidate below-DMA assets when an unrelated asset (SPY) crosses up — that would unblock holding BTC purchases through a bear cycle.

### 2026-05-12 - Delete demoted rules and reject extreme-fear consecutive-day promotion
- **Status**: active
- **Commit**: pending local change (`delete demoted portfolio rules`)
- **Deleted rules**: removed the demoted stable-gating and greed-suppression rule implementations, their dedicated unit tests, registry exports, API/frontend metadata references, validation-event shaping hooks, and current assistant context entries. Historical log rows remain as audit history only.
- **Semantic change tested**: `extreme_fear_dca_buy` now tracks `min_consecutive_extreme_fear_days` instead of first-detection age; leaving `extreme_fear` resets the per-symbol detection window before eligibility.
- **Rule-only sweep vs disabled standalone baseline**:
  | N consecutive days | ROI | ROI Delta | Calmar | Calmar Delta | Sharpe | Sharpe Delta | Trades | Trade Delta | Matches | Decision |
  | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
  | disabled baseline | 55.4133 | 0.0000 | 2.3006 | 0.0000 | 1.2962 | 0.0000 | 9 | 0 | 0 | baseline |
  | 0 | 54.3826 | -1.0307 | 2.2601 | -0.0405 | 1.2769 | -0.0193 | 20 | 11 | 102 | reject |
  | 3 | 54.8814 | -0.5319 | 2.2797 | -0.0209 | 1.2866 | -0.0096 | 17 | 8 | 61 | reject |
  | 5 | 55.0940 | -0.3193 | 2.2881 | -0.0125 | 1.2903 | -0.0059 | 17 | 8 | 37 | reject |
  | 7 | 55.3616 | -0.0517 | 2.2986 | -0.0020 | 1.2948 | -0.0014 | 17 | 8 | 21 | reject |
- **Decision**: user intuition was not confirmed. The best variant, N=7, still failed the +0.5pp ROI bar and slightly trailed disabled on Calmar and Sharpe, so `extreme_fear_dca_buy` remains non-default and the default snapshot should not be refreshed for this rule.
- **Validation**: focused affected tests passed (97 passed, 5 skipped), `pnpm --filter @zapengine/analytics-engine type-check` passed, `pnpm --filter @zapengine/analytics-engine lint` passed, `pnpm --filter @zapengine/analytics-engine deadcode` passed, and `pnpm --filter @zapengine/analytics-engine test` passed with 2420 tests plus zero 500-day snapshot drift. `analyze_compare.py --saved-config-id dma_fgi_portfolio_rules --from-date 2025-01-01 --to-date 2026-04-10 --summary` passed 14/14 validation checks with ROI 66.69%, Calmar 4.90, MaxDD -9.32%, and 48 trades.

### 2026-05-12 - Known-negative rule retune pass
- **Status**: active
- **Commit**: pending local change (`known-negative portfolio-rule retune`)
- **Finding**: Re-ran the 2026-05-09 known-negative rule plan against the current rule-only default. The fresh remove-all-three baseline is now stronger than the old pre-port anchor: `dma_fgi_portfolio_rules` without the three review rules is ROI 69.1371%, Calmar 5.0118, Sharpe 2.2797, MaxDD -9.3248%, 45 trades. Enabling all three old ports together is still harmful at ROI 51.4126%, Calmar 3.7889, Sharpe 2.0475, 39 trades. The only retune with material positive attribution was `eth_btc_deviation_dca` with wider 0.50/0.65 thresholds and 14d/60d cooldowns while keeping symmetric coverage enabled, so it was promoted back into the default rule set. `dma_stable_gating` and `greed_sell_suppression` remain non-default.
- **Hypothesis results vs demoted default**:
  | Rule / Hypothesis | ROI | Calmar | Sharpe | Trades | Decision |
  | --- | ---: | ---: | ---: | ---: | --- |
  | Demote default / remove all 3 | 69.1371 | 5.0118 | 2.2797 | 45 | baseline |
  | `dma_stable_gating` current fear trigger | 56.5837 | 4.1504 | 2.0685 | 46 | reject |
  | `dma_stable_gating` H1.A extreme-fear only | 69.2005 | 5.0161 | 2.2812 | 45 | reject: only +0.0634pp and rule-only delta 0 |
  | `dma_stable_gating` H1.C fear + negative FGI slope | 56.7962 | 4.1651 | 2.0752 | 49 | reject |
  | `greed_sell_suppression` current priority 23 | 65.9695 | 4.7947 | 2.1764 | 42 | reject |
  | `greed_sell_suppression` H2.C positive FGI slope | 67.2185 | 4.8813 | 2.2253 | 43 | reject |
  | `greed_sell_suppression` H2.A priority after overextension | 67.3677 | 4.8915 | 2.2291 | 42 | reject |
  | `eth_btc_deviation_dca` current 0.40/0.50, 7d/30d | 66.3992 | 4.8254 | 2.4036 | 44 | reject |
  | `eth_btc_deviation_dca` H3.A+H3.C 0.50/0.65, 14d/60d | 71.7135 | 5.1864 | 2.4741 | 48 | promote |
  | `eth_btc_deviation_dca` H3.B ETH-cheap only | 69.1371 | 5.0118 | 2.2797 | 45 | reject: no 500d lift |
  | `eth_btc_deviation_dca` H3.A+H3.C+H3.B | 69.1371 | 5.0118 | 2.2797 | 45 | reject: no matches |
- **Snapshot delta vs 2026-05-10 default**: ROI 69.1371% -> 71.7135% (+2.5764pp), Calmar 5.0118 -> 5.1864 (+0.1746), Sharpe 2.2797 -> 2.4741 (+0.1944), MaxDD unchanged at -9.3248%, trades 45 -> 48 (+3). The 500-day snapshot fixture was refreshed after this intentional drift.
- **Per-rule report**:
  | Rule | Matches | Wins | Shadowed |
  | --- | ---: | ---: | ---: |
  | dma_overextension_dca_sell | 236 | 89 | 6 |
  | dma_stable_gating | 158 | 0 | 5 |
  | extreme_fear_dca_buy | 102 | 0 | 4 |
  | fgi_downshift_dca_sell | 22 | 12 | 7 |
  | eth_btc_deviation_dca | 19 | 3 | 0 |
  | greed_sell_suppression | 12 | 0 | 0 |
  | cross_down_exit | 7 | 5 | 0 |
  | cross_up_equal_weight | 4 | 4 | 0 |
  | eth_btc_ratio_rotation | 3 | 3 | 0 |
  | spy_latch | 0 | 0 | 0 |

  | Shadower | Shadowed | Count |
  | --- | --- | ---: |
  | dma_overextension_dca_sell | fgi_downshift_dca_sell | 6 |
  | cross_down_exit | dma_stable_gating | 3 |
  | eth_btc_deviation_dca | dma_overextension_dca_sell | 3 |
  | cross_down_exit | dma_overextension_dca_sell | 2 |
  | dma_overextension_dca_sell | extreme_fear_dca_buy | 2 |
  | cross_down_exit | extreme_fear_dca_buy | 1 |
  | cross_up_equal_weight | dma_stable_gating | 1 |
  | cross_up_equal_weight | extreme_fear_dca_buy | 1 |
  | eth_btc_ratio_rotation | dma_overextension_dca_sell | 1 |
  | eth_btc_ratio_rotation | dma_stable_gating | 1 |
  | eth_btc_ratio_rotation | fgi_downshift_dca_sell | 1 |
- **Rule-only sweep**: Initial standalone sweep showed `dma_stable_gating` old trigger ROI -13.3723pp vs minimal baseline, `greed_sell_suppression` 0.0000pp, and `eth_btc_deviation_dca` old trigger +5.6761pp. The promoted ETH/BTC retune improved standalone isolation to ROI 61.9655% (+6.5522pp), Calmar 3.3651 (+1.0645), trades 12 (+3), matches 19. The only positive DMA variant, H1.A, had a 0.0000pp rule-only delta despite 53 matches, so it failed the retention bar.
- **Validation**: `analyze_compare.py --saved-config-id dma_fgi_portfolio_rules --from-date 2025-01-01 --to-date 2026-04-10 --summary` passed 14/14 validation checks with ROI 66.69%, Calmar 4.90, MaxDD -9.32%, 48 trades. Focused tests passed for `tests/services/backtesting/portfolio_rules/test_eth_btc_deviation_dca.py` and `tests/services/backtesting/strategies/test_dma_fgi_rule_attribution.py`. `tests/api/test_v3_strategy.py` could not run locally because the test Postgres on localhost:5433 was not running; the first failure was connection refused during fixture setup.
- **Next**: Keep `dma_stable_gating` and `greed_sell_suppression` in non-default attribution diagnostics. If revisiting DMA stable gating, require an event-driven previous-zone field rather than another broad state trigger.

### 2026-05-10 - Single strategy surface
- **Status**: active
- **Commit**: pending local change (`dma_fgi_portfolio_rules` only)
- **Finding**: Collapsed the production-facing strategy surface to the canonical `dma_fgi_portfolio_rules` recipe and removed the ETH/BTC rotation strategy plus leave-one-out attribution variants.
- **Default config**: replaced `eth_btc_rotation_default` with `dma_fgi_portfolio_rules_default` as the single seed default.
- **Snapshot scope**: the 500-day fixture now tracks only `dma_fgi_portfolio_rules`; historical attribution rows remain below for audit context.

### 2026-05-10 - Rule-only architecture migration
- **Status**: active
- **Commit**: `4bdd93f2` + pending local change (`rule-only portfolio rules migration`)
- **Finding**: Completed the rule-only migration by adding `SpyLatchRule` as a stateful post-intent adjustment, adding `EthBtcContinuousWeightRule` for saved-config BTC/ETH rotation, rewriting `eth_btc_rotation` onto the `RuleBasedAllocationExecutor`, and deleting the hierarchical/pair-rotation strategy infrastructure.
- **Deleted infrastructure**: removed `hierarchical_minimum.py`, `hierarchical_outer_policy.py`, `hierarchical_attribution.py`, `spy_crypto_hierarchical_rotation.py`, `pair_rotation_template.py`, the hierarchical attribution sweep/diagnostic scripts, and their dedicated tests.
- **Snapshot delta vs 2026-05-09 `dma_fgi_portfolio_rules` baseline**: ROI remains 50.5217%, Calmar 3.7265, Sharpe 2.0178, MaxDD -9.3248%, trades 52. The refreshed 500-day fixture removes `dma_fgi_hierarchical_control` and `retired hierarchical minimum`; `eth_btc_rotation` remains 126.2611% ROI, so the rule wrapper stayed within the ±5pp saved-config tolerance.
- **SPY latch attribution**: added `dma_fgi_portfolio_rules_minus_spy_latch` after the rule-only migration. The 500-day leave-one-out is behavior-neutral vs baseline: ROI 50.5217%, Calmar 3.7265, Sharpe 2.0178, MaxDD -9.3248%, trades 52.
- **Validation events**: added `spy_latch_absorb_fresh_stable_2026_04_16` for synthetic 14-day latch absorption and `eth_btc_continuous_weight_2025_07_15` for real BTC/ETH continuous weighting. Live `analyze_compare.py` validation passes for `dma_fgi_portfolio_rules` (19 checked) and `eth_btc_rotation` (3 checked).
- **Known issue carried forward**: `dma_stable_gating`, `greed_sell_suppression`, and `eth_btc_deviation_dca` still have negative leave-one-out attribution in the flat first-match engine. Next iteration should retune DMA stable gating to an event-driven trigger, revisit greed suppression interaction with overextension sells, and lower/fixture the ETH/BTC deviation DCA thresholds.

### 2026-05-09 - Flat portfolio-rule hierarchical behavior ports
- **Status**: superseded
- **Commit**: `065860d8` + pending local change (`dma_fgi_portfolio_rules` rule ports)
- **Finding**: Ported `dma_stable_gating`, `greed_sell_suppression`, and `eth_btc_deviation_dca` into the canonical flat portfolio-rule engine with leave-one-out attribution variants. The implementation is traceable and fixture-covered, but the 500-day snapshot says all three ports are harmful in the current flat-rule form.
- **Snapshot delta vs prior `dma_fgi_portfolio_rules` baseline**: ROI 67.6831% -> 50.5217% (-17.1614pp), Calmar 4.9129 -> 3.7265 (-1.1864), MaxDD unchanged at -9.3248%, trades 56 -> 52 (-4). The task brief referenced a 64.10% baseline, but the local pre-change snapshot was already 67.6831% from later pending iterations.
- **Leave-one-out attribution vs new baseline**: `_minus_dma_stable_gating` ROI 61.8548% (+11.3331pp when removed), Calmar +0.7864, trades +3; `_minus_greed_sell_suppression` ROI 53.3945% (+2.8728pp), Calmar +0.2021, trades +3; `_minus_eth_btc_deviation_dca` ROI 53.0608% (+2.5391pp), Calmar +0.1775, trades +7. Since removal improves ROI by at least 2pp for all three, each port fails the retention threshold as implemented.
- **Validation events**: added/updated `tests/fixtures/hierarchical_validation_events.json` events `greed_sell_suppression_2024_12_02`, `dma_stable_gating_2025_03_13`, and `eth_btc_deviation_dca_to_eth_2025_04_07`; relaxed `eth_cross_down_preserve_spy_2025_11_06` action matching because flat DMA stable gating can now surface a sell intent there.
- **2025-05-01 audit**: ETH/BTC ratio distance was -37.1915%, below the -40% DCA trigger, so `dma_fgi_portfolio_rules` correctly held on that date. The low-side deviation DCA fixture uses 2025-04-07, where the threshold is actually crossed.
- **Decision**: keep these ports only as explicit canonical-strategy behavior under review; do not promote them as proven improvements without narrower triggers, threshold tuning, or disabling the harmful pieces.

### 2026-05-08 — Portfolio rule cooldowns localized
- **Status**: active
- **Commit**: pending local change (`dma_fgi_portfolio_rules` per-rule cooldown)
- **Finding**: The shared post-trade portfolio cooldown gate was removed because it let a cross-down sell suppress short-lived extreme-fear DCA opportunities. Portfolio rules now expose rule-local cooldown fields, defaulting to 0d, and cooldown state is recorded only after an executed transfer.
- **Regression pins**: strategy coverage verifies a cross-down sell no longer blocks the next extreme-fear DCA, and custom per-rule cooldown skips only the cooling rule after actual execution.
- **Validation**: `dma_fgi_portfolio_rules` hierarchical validation passes with `extreme_fear_dca_2025_03_11` PASS; 500-day strategy snapshot reports no metric drift above tolerance.

### 2026-05-07 — Risk layer extraction and adaptive sizing audit trail
- **Status**: active
- **Commit**: pending local change (`phase4-risk-sizing`)
- **Finding**: Moved `trade_quota` and `dma_buy_gate` from portfolio-rule wrappers into post-decision `risk/` guards while preserving the old priority semantics, then added `SizingStrategy` with flat defaults and canonical `FgiExponentialSizing(max_multiplier=1.1)` for extreme-fear buys.
- **Snapshot delta vs flat sizing ablation**: `dma_fgi_portfolio_rules` ROI 64.0972% -> 64.0974% (+0.0002pp), Calmar 4.2665 -> 4.2665 (+0.0000), Sharpe 1.9112 -> 1.9069 (-0.0043), MaxDD unchanged at -10.2024%, trades 48 -> 48 (0). `_minus_adaptive_sizing` preserves the Phase B flat baseline.
- **Audit trail**: `decisions.jsonl` now emits `sizing_meta` for DCA step rules. Phase B flat decisions show `base == adjusted`; Phase C adaptive extreme-fear buys show `strategy=fgi_exponential`, FGI value, and `base != adjusted`.
- **Validation**: `tests/test_validation_events.py` passed after both Phase B and Phase C. Full `pnpm --filter @zapengine/analytics-engine test` remains blocked locally by a corrupted Docker test container (`analytics-test-postgres` returns containerd input/output errors), not by pytest failures.

### 2026-05-07 — Portfolio rules hierarchical-feature port stopped at DMA stable gating
- **Status**: superseded
- **Commit**: pending local change (`dma_fgi_portfolio_rules` priority-spacing setup)
- **Finding**: Phase 0 priority spacing was behavior-neutral after preserving the existing optional `dma_buy_gate` order after overextension sells. Phase 1's direct flat translation of DMA stable gating (`BTC/ETH below DMA` + crypto FGI in `fear/extreme_fear` -> route to stable) had the wrong sign and was reverted per the stop condition. The ablation proved isolation, but the trigger was too broad in the flat rule layer and blocked profitable extreme-fear DCA exposure.
- **Snapshot result**: Phase 0 baseline remained `dma_fgi_portfolio_rules` ROI 64.10%, Calmar 4.27, 48 trades. The reverted Phase 1 candidate fell to ROI 21.76%, Calmar 1.51, 33 trades, while `_minus_dma_stable_gating` returned to ROI 64.10%, Calmar 4.27, 48 trades.
- **Next**: Reassess the source behavior before trying another port. The profitable hierarchical "DMA stable gating" appears tied to outer DMA intent composition, not the broad below-DMA fear/extreme-fear crypto blocker tested here.

### 2026-05-07 — Cross-up cooldown restored and validation trigger assets
- **Status**: active
- **Commit**: pending local change (`dma_fgi_portfolio_rules` cooldown validation follow-up)
- **Finding**: Reverted the raw `cross_event` re-entry bypass introduced in the 2026-05-06 iteration: `cross_up_equal_weight` now requires `actionable_cross_event == "cross_up"` and emits `portfolio_rule_trigger_assets` so hierarchical observation diagnostics select the actual cross-triggering asset. `analyze_compare.py` now marks cross-down validation events as `SKIPPED` when the reference asset was already at zero in the previous explicit target allocation.
- **Snapshot delta vs 55.02% / 47 trades / 3.20 Calmar baseline**: ROI 55.02% → 64.31% (+9.29pp), Calmar 3.20 → 4.28 (+1.09), Sharpe 1.63 → 1.90 (+0.27), MaxDD -11.80% → -10.20% (+1.59pp), trades 47 → 47 (0).
- **Validation events**: Targeted `dma_fgi_portfolio_rules` checks now resolve `btc_cross_down_2025_03_08` as `SKIPPED`, `cooldown_period_2025_03_24` as `PASS`, and `eth_cross_up_2025_06_09` as `PASS`. The full fixture still has unrelated pre-existing failures in other event families.

### 2026-05-06 — Portfolio cross semantics and analyzer output cleanup
- **Status**: active
- **Commit**: pending local change (`dma_fgi_portfolio_rules` fixture semantics + `analyze_compare.py` CLI cleanup)
- **Finding**: Portfolio cross-down exits now liquidate BTC/ETH as one crypto peer group while preserving SPY, and SPY-only cross-down remains SPY-scoped. Cross-up equal-weight now treats a same-day raw cross-up as eligible even when the previous cross-down cooldown still marks the above zone blocked, allowing stable to redeploy on the explicit cross-up signal.
- **Analyzer cleanup**: `analyze_compare.py` no longer exposes output-section profiles; default output renders all sections and `--section` remains the explicit subset mechanism. Markdown `--out` paths are resolved to absolute paths, emit a save notice, and write fallback markdown when markdown rendering fails after constraint validation is available.
- **Snapshot result**: 500-day `dma_fgi_portfolio_rules` snapshot check reports no metric drift above tolerance; the traceability baseline remains ROI 55.02%, Calmar 3.20, MaxDD -11.80%, and 47 trades.
- **Validation events**: `btc_cross_down_preserve_spy_2025_10_18` and `spy_cross_up_redeploy_2026_04_08` pass as targeted live API constraint checks for `dma_fgi_portfolio_rules`.

### 2026-05-05 — Portfolio rules atomic execution
- **Status**: active
- **Commit**: pending local change (`dma_fgi_portfolio_rules` rule-based executor)
- **Finding**: `dma_fgi_portfolio_rules` now uses `RuleBasedAllocationExecutor`, so each matched portfolio rule executes the full target-allocation delta on the same bar instead of routing through `FgiExponentialPacingPolicy` and multi-step ramps. The legacy allocation executor, pacing policy, and execution plugins remain untouched for the other strategies.
- **Rule migration**: DMA buy-side sideways confirmation and trade quotas moved into portfolio-rule hold guards for this strategy only. The executor owns `last_trade_date`/`trade_dates`, and the decision policy reads them through `PortfolioSnapshot`.
- **Snapshot delta vs previous `dma_fgi_portfolio_rules` baseline**: ROI 33.08% → 55.02% (+21.94pp), Calmar 1.02 → 3.20 (+2.17), Sharpe 0.87 → 1.63 (+0.75), MaxDD -22.63% → -11.80% (+10.83pp), trades 51 → 47 (-4).
- **Regression pins**: unit coverage verifies atomic full-delta transfers, cost-model handoff, buy-gate holds, trade-quota holds, and strategy wiring. The 2025-03-24 validation event passes, and the research-inclusive 500-day snapshot re-anchor shows drift only in the portfolio-rules family before update.

### 2026-05-05 — SPY portfolio cross-down cooldown aligned to 30d
- **Status**: active
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
- **Attribution sanity**: leave-one-out ROI deltas vs canonical are cross-down exit -0.70pp, cross-up equal-weight -0.51pp, extreme-fear buy -0.39pp, overextension sell +1.91pp, and FGI-downshift sell -0.05pp. The v1 goal is traceability, not beating `retired hierarchical minimum`.
- **Comparison**: vs `retired hierarchical minimum` (121.30% ROI), -111.93pp ROI; vs `dma_fgi_eth_btc_minimum` (145.28% ROI), -135.91pp ROI.

### 2026-05-04 — SPY macro extreme fear + persistent SPY latch
- **Commit**: this commit (`retired hierarchical minimum` production behavior re-anchor)
- **Finding**: Added fixture-backed crypto extreme-fear DCA dates, introduced a SPY-side macro extreme-fear DCA rule using CNN macro F&G plus SPY DMA, and promoted the SPY latch from same-tick-only behavior to persistent fresh-stable absorption while the latch remains active. The 500-day minimum baseline stays inside the ROI noise band while improving risk-adjusted metrics, so the snapshot was re-anchored.
- **Snapshot delta vs previous `retired hierarchical minimum` baseline**: ROI 121.44% → 121.30% (-0.14pp), Calmar 4.50 → 4.63 (+0.12), Sharpe 1.91 → 1.98 (+0.07), MaxDD -17.46% → -16.97% (+0.48pp), trades 85 → 81 (-4).
- **Validation events**: new constraints pass for crypto extreme-fear DCA on 2025-03-11 and 2025-04-07, SPY macro extreme-fear DCA on 2025-03-13 and 2025-04-08, and persistent latch absorption on 2025-05-24. Proposed 2025-03-09/2025-03-03 were shifted because the trigger gates did not resolve to crypto extreme fear / SPY below-DMA respectively.

### 2026-05-03 — Flat minimum baseline
- **Commit**: this commit (`dma_fgi_flat_minimum` research baseline + sweep)
- **Rationale**: Break the strategy out of the hierarchical outer SPY/crypto sleeve and inner BTC/ETH ratio framework while preserving the minimum stack's event-driven DMA semantics. The flat baseline removes outer/inner gating, adaptive crypto DMA reference selection, ETH/BTC ratio rotation, and target composers; each of SPY/BTC/ETH gets its own DMA-200 gate. Cross-down sells only the triggering asset to stable, explicit buy intents redeploy existing stable, and no-signal days preserve the current allocation.
- **Result**: `dma_fgi_flat_minimum` ROI = 24.04%, Calmar 0.93, MaxDD -18.31%, 55 trades.
- **Comparison**:
  - vs `retired hierarchical minimum` (121.44% ROI, 4.50 Calmar, -17.46% MaxDD, 85 trades): -97.40pp ROI, -3.57 Calmar, 0.85pp deeper drawdown, -30 trades.
  - vs `dma_fgi_eth_btc_minimum` (145.28% ROI, 4.46 Calmar, -20.72% MaxDD, 51 trades): -121.24pp ROI, -3.53 Calmar, 2.41pp shallower drawdown, +4 trades.
- **Validation note**: `analyze_compare.py` on 2025-02-02 now passes `eth_cross_down_2025_02_02` for `dma_fgi_flat_minimum`: `target_allocation.eth = 0.0`, portfolio ETH = 0.0, and stable rises to ~72.11%.

### 2026-05-02 - SPY tax fix attempt: DMA-discipline variants (Phase D)
- **Commit**: this commit (DMA cooldown/below-DMA research variants + sweep)
- **D-1 finding**: BTC vs ETH split on 2025-04-22 in `retired hierarchical minimum` is BTC 0.00%, ETH 90.48%, SPY 9.52%, stable 0.00%; inner-pair fix needed yes.
- **Variants**:
  - Retired hierarchical minimum cross-cooldown: 30-day actionable cross-down cooldown for SPY/BTC/ETH allocation increases.
  - Retired hierarchical minimum below-DMA hold: no allocation increase while SPY/BTC/ETH is below its own DMA, with extreme-fear DCA carve-out.
  - Retired hierarchical minimum DMA-disciplined: both constraints together.
- **Results vs `retired hierarchical minimum` baseline (121.44% ROI, 85 trades)**:
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
  - Retired hierarchical minimum DMA-buffer: S1 test; requires 3% above-DMA distance before above-DMA DMA buy entries.
  - Retired hierarchical minimum dual-above hold: S4 test; holds the current outer allocation while both SPY and crypto are above DMA.
- **Results vs `retired hierarchical minimum` baseline (121.44% ROI, 85 trades)**:
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
- **Hypothesis**: 19.77pp gap between `dma_fgi_adaptive_binary_eth_btc` (141.21%) and `retired hierarchical minimum` (121.44%) is a mix of SPY constraint cost / outer architecture cost / context-dependent greed_sell_suppression
- **Result**: `dma_fgi_eth_btc_minimum` ROI = 145.28%, Calmar 4.46, MaxDD -20.72%, 51 trades
- **Interpretation (Branch 2)**: Greed Sell Suppression is **universal positive** (+4.07pp in 2-asset vs adaptive_binary 141.21%). SPY tax is **23.84pp** (= 145.28 - 121.44), larger than first estimated. SPY tax is **architecture-induced, not asset-induced** — `hierarchical_minimum` executes 33 more trades than the 2-asset version (84 vs 51), strongly suggesting outer SPY/crypto switching is over-active and mistimes asset transitions.
- **Next iteration target**: diagnose SPY/crypto switch timing in outer pair-template. Suspects: outer DMA gating threshold too aggressive, composition formula shrinks crypto share too fast when SPY rises, symmetric DMA200 windows ignore asset volatility differences, no "both-above-DMA hold" rule (oscillates between SPY and crypto).

### 2026-04-15 — Buy Floor removed, Phase A deprecation
- **Commit**: `e3e140c` (Buy Floor removal + 8 strategies marked DEPRECATED)
- **Finding**: `dma_buy_strength_floor` has +0.28pp Δ in the minimum baseline (1 trade difference over 500 days). Below noise threshold. Removed from `MinimumHierarchicalOuterPolicy` at the type level. Added `feature_summary()` method to outer policy Protocol.
- **Snapshot delta**: `retired hierarchical minimum` 121.16% → ~121.44% (matches old `_minus_buy_floor` exactly, validating behavior-equivalence).
- **Deprecated**: 4 `full_minus_*` Phase 1 variants (poisoned by Adaptive DMA), `adaptive_dma_only`, `fear_recovery_only`, two `(sucks)` controls.

### 2026-04-15 — `retired hierarchical minimum` shipped
- **Commit**: `fe8db22`
- **Finding**: Minimum hierarchical SPY/crypto strategy (DMA gating + Greed Sell Suppression + Buy Floor + inner ETH/BTC rotation) hits 121.16% ROI vs production 36.62%. Validates that Adaptive DMA Reference + Fear Recovery Buy + SPY Cross-Up Latch are all unnecessary or harmful.
- **Architecture**: introduced `HierarchicalOuterDecisionPolicy` Protocol, extracted `FullFeaturedOuterPolicy` from existing strategy class (behavior-preserving refactor), added `MinimumHierarchicalOuterPolicy` as a 2-feature composition.
- **Snapshot deltas**:
  - `retired hierarchical minimum`: 121.16% ROI, 4.50 Calmar
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
