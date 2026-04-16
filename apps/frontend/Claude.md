# Code Style

- Use ES modules (`import`/`export`), not CommonJS
- Destructure imports: `import { foo } from 'bar'`
- Use barrel exports: `import { connectWallet } from '@/services'` not deep paths
- Double quotes for strings (Prettier enforced)
- Arrow functions with `avoid` parens: `x => x + 1`
- Path alias: `@/*` maps to `src/*`

# TypeScript

- Strict mode enabled with comprehensive checks
- NO implicit any - all types must be explicit
- NO unused locals or parameters
- Use `type` for object shapes, `interface` for extensible contracts
- Include TSDoc for all exported functions with `@param`, `@returns`, `@example`

# Testing

```bash
pnpm run test:unit           # Run unit tests (memory optimized)
pnpm run test:e2e           # Run Playwright E2E tests
pnpm run test:coverage      # Check coverage thresholds (90/85/90/90, validated on Node 20)
pnpm run type-check         # ALWAYS run before committing
```

- Unit tests in `tests/unit/`, E2E in `tests/e2e/`
- Use `renderWithProviders()` from `tests/test-utils.tsx` for component tests
- Mock service functions, not implementation details
- Coverage thresholds: 90% statements/functions/lines, 85% branches
- Coverage batching: set `VITEST_COVERAGE_BATCH_SIZE=<n>` if a local run still needs smaller batches

# Architecture Patterns

**IMPORTANT: Use service functions for ALL API operations**

```typescript
// ✅ Correct - service function pattern
import { getPortfolioAPR } from "@/services/analyticsService";
const data = await getPortfolioAPR(userId);

// ❌ Wrong - no classes or direct fetch calls
const client = new APIClient();
const data = await fetch("/api/...");
```

- Service functions in `src/services/` (plain functions, no classes)
- Custom hooks in `src/hooks/` for business logic
- React Query for API state management
- React Context only for global state (wallet, onboarding)
- Component state for UI-only concerns

# Component Patterns

- Feature-based organization: `components/FeatureName/`
- Memoize expensive components with `React.memo`
- Use `useMemo`/`useCallback` for expensive computations
- Props interfaces for all components
- Error boundaries for async operations

# API Integration

**Service function structure:**

```typescript
// src/services/myService.ts
export async function fetchData(params: Params): Promise<Result> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed");
  return response.json();
}
```

**React Query integration:**

```typescript
// src/hooks/queries/useMyData.ts
export function useMyData(id: string) {
  return useQuery({
    queryKey: ["myData", id],
    queryFn: () => myService.fetchData(id),
  });
}
```

# Environment Variables

Required in `.env.local`:

```bash
VITE_API_URL=                # Account API endpoint
VITE_ANALYTICS_ENGINE_URL=   # Analytics API endpoint
VITE_INTENT_ENGINE_URL=      # Transaction execution API
```

# Development Workflow

```bash
pnpm run dev              # Start Vite dev server
pnpm run lint:fix         # Auto-fix linting issues
pnpm run format           # Format all files
```

**Before committing:**

1. `pnpm run type-check` - TypeScript must pass
2. `pnpm run lint` - No ESLint errors
3. `pnpm run test:unit` - Tests must pass
4. Pre-commit hook runs automatically (type-check, lint, tests, deadcode, duplicates)

# Common Gotchas

- **Memory**: Use `cross-env NODE_OPTIONS=--max-old-space-size=3072` for dev/build
- **Node Runtime**: Coverage/test automation is validated on Node 20 (`.nvmrc` + CI baseline); newer
  majors are best-effort
- **Env Prefix**: All client-side env vars must use the `VITE_` prefix in `.env.local`
- **CSP Headers**: Strict Content-Security-Policy - test new external domains in dev first
- **Wallet Provider**: Access via `useWalletProvider()` hook, not direct Thirdweb hooks
- **Bundle URLs**: `/bundle?userId=<address>` - handle owner vs visitor mode
- **API Schema**: Analytics API uses new field names (`daily_values` not `daily_totals`)

# Performance

- React Query caching: 5min stale time for analytics data
- Component memoization for charts and expensive renders
- Lazy load routes and heavy components
- GPU-accelerated animations (CSS transforms only)

# Security

- NEVER commit secrets or API keys
- Validate all user inputs with Zod schemas
- Use CSP-compliant inline styles (Tailwind safe)
- Wallet addresses are case-sensitive - use checksummed format

# Project-Specific Rules

**YOU MUST follow these patterns:**

1. **Service Functions Only** - No API client classes, use plain functions
2. **Barrel Imports** - Use `@/services`, `@/types`, `@/utils` not deep paths
3. **Type Safety** - All function params and returns must have explicit types
4. **Error Handling** - Wrap async operations in try-catch or React Query error states
5. **Testing** - New features require unit tests with 90% coverage
6. **TSDoc** - All exported functions need documentation with examples

# Files to Never Modify

- `dist/` - Build output, auto-generated
- `coverage/` - Test coverage reports
- `playwright-report/` - E2E test results
- `tsconfig.tsbuildinfo` - TypeScript cache

# Quick Reference

| Task             | Command                   |
| ---------------- | ------------------------- |
| Add dependency   | `pnpm add <package>`      |
| Type check       | `pnpm run type-check`     |
| Fix linting      | `pnpm run lint:fix`       |
| Run tests        | `pnpm run test:unit`      |
| Check coverage   | `pnpm run test:coverage`  |
| Find dead code   | `pnpm run deadcode:check` |
| Find duplicates  | `pnpm run dup:check`      |
| E2E tests        | `pnpm run test:e2e`       |
| E2E debug        | `pnpm run test:e2e:debug` |
| Build production | `pnpm run build`          |
