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
