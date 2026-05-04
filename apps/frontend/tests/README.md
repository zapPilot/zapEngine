# Testing Guide

Quick reference for testing in the Zap Pilot frontend.

## Quick Start

```typescript
import { render, screen } from "tests/test-utils";
import { describe, expect, it } from "vitest";
import { MyComponent } from "@/components/MyComponent";

describe("MyComponent", () => {
  it("should render correctly", () => {
    render(<MyComponent />);
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });
});
```

```typescript
import { renderHook } from 'tests/test-utils';
import { useMyHook } from '@/hooks/useMyHook';

describe('useMyHook', () => {
  it('should return correct value', () => {
    const { result } = renderHook(() => useMyHook());
    expect(result.current.value).toBe('expected');
  });
});
```

## Test Utilities

Always use `render` and `renderHook` from `tests/test-utils` — they wrap all required providers.

```typescript
import { mockFormatters, resetFormatterMocks } from 'tests/test-utils';
import { vi } from 'vitest';

vi.mock('@/lib/formatters', () => mockFormatters);

describe('MyComponent', () => {
  beforeEach(() => resetFormatterMocks());
  // tests...
});
```

## Running Tests

```bash
pnpm test:unit               # Run all
pnpm test:unit -- --watch   # Watch mode
pnpm test:unit -- --coverage
pnpm test:e2e              # E2E tests
```

## Related

- `tests/helpers/swapPageTestUtils.ts` — SwapPage test helpers
- `tests/test-utils.tsx` — Main test utilities (has inline docs)

## Unit

```bash
pnpm test:unit
pnpm test:unit -- --coverage
pnpm test:unit -- WalletPortfolio.test.tsx
```

Test files:

- `WalletPortfolio.test.tsx` — Data fetching, transformation, state
- `PortfolioOverview.test.tsx` — Pure presentation, loading/error states

Mock strategy: External deps mocked: `useUser`, `usePortfolio`, `framer-motion`, `lucide-react`.

## E2E

V22 feature flag rollout tests using Playwright.

Test files:

| File                             | Coverage                 |
| -------------------------------- | ------------------------ |
| `v22-feature-flag.spec.ts`       | Feature flags, rollout % |
| `v22-multi-wallet.spec.ts`       | Wallet switching         |
| `v22-bundle-sharing.spec.ts`     | Owner/visitor modes      |
| `v22-core-functionality.spec.ts` | Dashboard, charts        |
| `v22-mobile-responsive.spec.ts`  | Mobile/tablet            |

```bash
pnpm test:e2e
pnpm test:e2e -- --ui
pnpm exec playwright test tests/e2e/v22-feature-flag.spec.ts
```

Test IDs: See `DATA_TESTID_GUIDE.md` for `data-testid` attributes.
