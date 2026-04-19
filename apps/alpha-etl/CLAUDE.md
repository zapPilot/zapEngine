See @README.md for project overview and @package.json for available scripts.

# Gotchas

- Test framework is **Vitest**, not Jest. Use `vi.mock()`, not `jest.mock()`.
- Import paths MUST include `.js` extension: `import { foo } from './bar.js'` (ES modules)
- Close DB pool in tests: `afterAll(() => closeDbPool())`
- APY ≠ APR — use `aprUtils.ts` for conversions, never calculate manually
- Rate limits are enforced in `BaseApiFetcher` — do not bypass: DeFiLlama 60 req/min, DeBank 1 req/sec, Hyperliquid 60 req/min
- Materialized views refresh automatically when `ENABLE_MV_REFRESH=true`
