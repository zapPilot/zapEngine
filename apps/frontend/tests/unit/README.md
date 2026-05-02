# Unit Tests

Quick reference for component tests.

## Running

```bash
pnpm test:unit
pnpm test:unit -- --coverage
pnpm test:unit -- WalletPortfolio.test.tsx
```

## Test Files

- `WalletPortfolio.test.tsx` — Data fetching, transformation, state
- `PortfolioOverview.test.tsx` — Pure presentation, loading/error states

## Mock Strategy

External deps mocked: `useUser`, `usePortfolio`, `framer-motion`, `lucide-react`.
