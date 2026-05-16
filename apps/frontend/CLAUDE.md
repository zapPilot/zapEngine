See @README.md for project overview and @package.json for available scripts.

# Architecture

- API calls: plain service functions in `src/services/` only — no classes, no direct `fetch()` in
  components
- Imports: use barrel paths (`@/services`, `@/types`, `@/utils`) not deep file paths
- Wallet access: always via `useWalletProvider()` hook — never direct Thirdweb hooks

# Testing

- Unit tests: `pnpm test:unit` (not `pnpm test`)
- Component tests: use `renderWithProviders()` from `tests/test-utils.tsx`
- Coverage is validated on Node 24 — other majors are best-effort (see `scripts/run-sharded-coverage.js`)

# Gotchas

- Dev/build may OOM on large machines: use `cross-env NODE_OPTIONS=--max-old-space-size=1024`
- Analytics API field is `daily_values`, not `daily_totals`
- All client-side env vars must have `VITE_` prefix
