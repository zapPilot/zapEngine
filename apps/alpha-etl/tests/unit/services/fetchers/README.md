# Fetcher Tests

Unit tests for DeFi data fetcher services.

## Test Files

- `defillama.test.ts` — DeFiLlama fetcher: API integration, data transformation, error handling, rate limiting, filtering, symbol matching, edge cases
- `pendle.test.ts` — Pendle fetcher: chain support, market types (PT/LP), data transformation, rate limiting, IL risk, reward calculations

## Running

```bash
pnpm test tests/unit/services/fetchers/
pnpm test tests/unit/services/fetchers/defillama.test.ts
pnpm test tests/unit/services/fetchers/ -- --coverage
```