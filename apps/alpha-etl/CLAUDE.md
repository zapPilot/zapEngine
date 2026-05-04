See @README.md for project overview and @package.json for available scripts.

# Gotchas

- Test framework is **Vitest**, not Jest. Use `vi.mock()`, not `jest.mock()`.
- Import paths MUST include `.js` extension: `import { foo } from './bar.js'` (ES modules)
- Close DB pool in tests: `afterAll(() => closeDbPool())`
- APY ≠ APR — use `aprUtils.ts` for conversions, never calculate manually
- Rate limits are enforced in `BaseApiFetcher` — do not bypass: DeFiLlama 60 req/min, DeBank 1 req/sec, Hyperliquid 60 req/min
- Materialized views refresh automatically when `ENABLE_MV_REFRESH=true`

# Macro Fear & Greed

- CNN Fear & Greed is a 0-100 broader US equity sentiment composite, not an S&P500-only signal. Low values mean fear; high values mean greed.
- Use `macro_fear_greed` / `us_equity_fear_greed` naming. Do not name this `sp500_fgi`.
- The CNN source is an unofficial/internal JSON endpoint (`production.dataviz.cnn.io/index/fearandgreed/graphdata`), so provider code must use cache/fallback and must not be called directly from strategy logic.
- Store CNN macro FGI in `alpha_raw.macro_fear_greed_snapshots`; do not mix it into crypto `alpha_raw.sentiment_snapshots`.
- Strategy consumers should only read the normalized provider result (`score`/`normalized_score` 0..100, `label`, `source`, `updated_at`) from cached DB-backed data.
