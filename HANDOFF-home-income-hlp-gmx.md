# HANDOFF — Home income: HLP + GMX v2

## Status
Investigation complete; no production code changed. The missing Home rows are primarily a display-classification boundary, not absent source data.
Working tree: GitHub-only handoff branch; only this handoff file is added.

## Verified facts
- Home only keeps rows whose protocol class is `passive`. [verified: apps/app/src/integration/homeIncomeModel.ts:77]
- The shared classifier deliberately returns `strategy` for any protocol name containing `gmx` or `hyperliquid`; its test locks that behavior. [verified: packages/app-core/src/lib/analytics/incomeClassification.ts:7] [verified: packages/app-core/tests/lib/analytics/incomeClassification.test.ts:10]
- PR #378 explicitly made "Strategy protocols remain excluded from passive-income totals" an acceptance criterion; this omission was intentional at that time, not an accidental UI regression. [verified: PR #378 description → "Strategy protocols remain excluded from passive-income totals."]
- Hyperliquid already uses the USD-balance yield path: SQL classifies it as `usd_balance` and feeds `net_usd_value`. [verified: apps/analytics-engine/src/queries/sql/portfolio_snapshots_for_yield_returns.sql:36] [verified: apps/analytics-engine/src/queries/sql/portfolio_snapshots_for_yield_returns.sql:69]
- HLP is an allowed yield position type, and USD carry is calculated as current balance minus previous balance. [verified: apps/analytics-engine/src/services/aggregators/yield_return_aggregator.py:30] [verified: apps/analytics-engine/src/services/aggregators/yield_return_aggregator.py:306]
- The yield-service test proves HLP reaches `protocol_breakdown`; its sample produces Hyperliquid total yield -2 USD. [verified: apps/analytics-engine/tests/services/test_yield_return_service.py:317] [verified: apps/analytics-engine/tests/services/test_yield_return_service.py:356]
- Production HLP data has non-zero day-to-day equity deltas (example: 2026-09-17 +$3.56). [verified: Supabase read-only SQL 2026-09-19 → HLP daily_delta_usd=3.56]
- GMX v2 `Liquidity Pool` is accepted by the token-delta aggregator. The yield SQL reads `detail.supply_token_list` / borrow / reward lists for non-Hyperliquid protocols. [verified: apps/analytics-engine/src/services/aggregators/yield_return_aggregator.py:29] [verified: apps/analytics-engine/src/queries/sql/portfolio_snapshots_for_yield_returns.sql:75]
- Production GMX v2 rows do contain `detail.supply_token_list`; consecutive-day amount deltas are non-zero (example WBTC amount-change attribution on 2026-09-18: -$94.4299). [verified: Supabase read-only SQL 2026-09-19 → GMX V2 supply_tokens_n=1 and amount_change_usd=-94.4299]
- `token_yield_usd` is explicitly only a balance-change attribution, not proven interest; deposits/withdrawals and protocol mechanics can move it too, with IQR used to fence funding spikes. [verified: apps/analytics-engine/src/services/aggregators/delta_outliers.py:3]

## Inventory
apps/app/src/integration/homeIncomeModel.ts:77  Home inclusion boundary → left alone: handoff-only PR
packages/app-core/src/lib/analytics/incomeClassification.ts:7  strategy/passive taxonomy → left alone: taxonomy is useful outside Home
apps/analytics-engine/src/queries/sql/portfolio_snapshots_for_yield_returns.sql:36  source shaping → left alone: both protocols already enter the yield pipeline
apps/analytics-engine/src/services/aggregators/yield_return_aggregator.py:29  delta calculation → left alone: current behavior is shared and broader than this UI issue
apps/analytics-engine/tests/integration/conftest.py:633  GMX fixture → left alone: fixture proves portfolio presence, not Home inclusion

## Tests
- No tests changed. Existing `homeIncomeModel.test.ts` currently asserts GMX / Hyperliquid exclusion indirectly. mutation: not run
- Future regression should feed GMX V2 + Hyperliquid rows into `buildHomeIncomeView` and assert both survive with the intended labels/totals. mutation: not run
- Add/retain backend coverage proving HLP and GMX source rows produce non-empty `protocol_breakdown`. mutation: not run

## Decisions
- Do not globally reclassify GMX / Hyperliquid as `passive`; that would erase the allocation/business distinction introduced in PR #378.
- Decouple "strategy vs passive protocol" from "income-bearing row shown on Home". Home should include observed carry from both classes when the user holds the position.
- Preserve the current attribution caveat: present these as estimated protocol income/return, not guaranteed interest/APR.
- Prefer displaying Hyperliquid HLP as `HLP` while retaining `hyperliquid` as the protocol/icon identity.

## Scope
Deliberately out: no production code, schema, API, or classifier change in this PR; no APR-source redesign.
Not reached: implementation of the Home inclusion predicate / display label and its regression tests.

## Gates
- Repository executable gates [not run] — investigation/hand-off only; no local workspace was used.
- Production data checks → pass: read-only Supabase queries confirmed recent HLP and GMX v2 source deltas.

## Traps
- Simply deleting the classifier filter makes the UI appear fixed, but also silently changes a deliberate product taxonomy; keep classification and presentation concerns separate.
- GMX token amount change is not synonymous with fee APR. Do not rename it "interest" unless a dedicated GMX APR/fee attribution source is added.

## Open questions
- Should the card title stay "Passive income" once strategy carry is included, or become the broader "Protocol income / Income"?
- Should GMX v2 keep observed amount-delta attribution, or later gain a dedicated fee/APR model for a cleaner run-rate estimate?
