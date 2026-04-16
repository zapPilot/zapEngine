# Testing Guide

Comprehensive guide for writing tests in the Zap Pilot frontend application.

## Table of Contents

- [Quick Start](#quick-start)
- [Test Utilities](#test-utilities)
- [Mocking](#mocking)
- [Best Practices](#best-practices)
- [Migration Guide](#migration-guide)

## Quick Start

### Basic Component Test

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

### Hook Test

```typescript
import { renderHook } from "tests/test-utils";
import { describe, expect, it } from "vitest";
import { useMyHook } from "@/hooks/useMyHook";

describe("useMyHook", () => {
  it("should return correct value", () => {
    const { result } = renderHook(() => useMyHook());
    expect(result.current.value).toBe("expected");
  });
});
```

## Test Utilities

### Rendering with Providers

**✅ DO: Use `render` from test-utils**

```typescript
import { render, screen } from "tests/test-utils";

// Automatically wraps with QueryClient, ToastProvider, etc.
render(<MyComponent />);
```

**❌ DON'T: Manually create providers**

```typescript
// Avoid this pattern
const queryClient = new QueryClient();
<QueryClientProvider client={queryClient}>
  <MyComponent />
</QueryClientProvider>;
```

### Hook Testing with Context

**✅ DO: Use `renderHook` from test-utils**

```typescript
import { renderHook } from "tests/test-utils";

// Automatically wraps with providers
const { result } = renderHook(() => useMyQuery());
```

### Custom Wrappers

If you need additional providers:

```typescript
import { render } from "tests/test-utils";
import { MyCustomProvider } from "@/contexts/MyCustomContext";

function Wrapper({ children }: { children: ReactNode }) {
  return <MyCustomProvider>{children}</MyCustomProvider>;
}

render(<MyComponent />, { wrapper: Wrapper });
```

## Mocking

### Formatter Mocks

**✅ DO: Use centralized formatter mocks**

```typescript
import { mockFormatters, resetFormatterMocks } from "tests/test-utils";
import { vi } from "vitest";

vi.mock("@/lib/formatters", () => mockFormatters);

describe("MyComponent", () => {
  beforeEach(() => {
    resetFormatterMocks(); // Clear mock history between tests
  });

  it("formats currency", () => {
    render(<MyComponent amount={1234.56} />);
    expect(mockFormatters.formatCurrency).toHaveBeenCalledWith(1234.56);
  });
});
```

**❌ DON'T: Create custom formatter mocks**

```typescript
// Avoid duplicating this pattern
vi.mock("@/lib/formatters", () => ({
  formatCurrency: vi.fn(amount => `$${amount}`),
  // ... more formatters
}));
```

### Framer Motion Mocks

**✅ DO: Use shared framer-motion mocks**

```typescript
import { setupFramerMotionMocks } from "tests/utils/framerMotionMocks";

setupFramerMotionMocks();

describe("AnimatedComponent", () => {
  // Tests use plain div/button instead of motion.div/motion.button
});
```

### API Service Mocks

```typescript
import { vi } from "vitest";
import * as accountService from "@/services/accountService";

vi.mock("@/services/accountService", () => ({
  connectWallet: vi.fn(),
  addWallet: vi.fn(),
}));

describe("WalletComponent", () => {
  it("calls connectWallet", async () => {
    vi.mocked(accountService.connectWallet).mockResolvedValue({
      userId: "123",
      wallets: [],
    });

    render(<WalletComponent />);
    // ... assertions
  });
});
```

## Best Practices

### 1. Test Organization

```typescript
describe("ComponentName", () => {
  describe("Feature Group", () => {
    it("should do specific thing", () => {
      // Test implementation
    });
  });

  describe("Edge Cases", () => {
    it("should handle error state", () => {
      // Test implementation
    });
  });
});
```

### 2. Clear Test Descriptions

**✅ DO: Be specific**

```typescript
it("should show loading spinner when isLoading is true", () => {});
it("should format large numbers with K/M/B suffixes", () => {});
```

**❌ DON'T: Be vague**

```typescript
it("works correctly", () => {});
it("handles the case", () => {});
```

### 3. Test User Behavior

**✅ DO: Test from user perspective**

```typescript
import { userEvent } from "@testing-library/user-event";

it("should toggle visibility when button is clicked", async () => {
  const user = userEvent.setup();
  render(<BalanceDisplay />);

  const toggleButton = screen.getByRole("button", { name: /toggle/i });
  await user.click(toggleButton);

  expect(screen.getByText("****")).toBeInTheDocument();
});
```

**❌ DON'T: Test implementation details**

```typescript
it("should call setState with true", () => {
  const setState = vi.fn();
  // Testing internal implementation
});
```

### 4. Async Testing

```typescript
import { waitFor } from "tests/test-utils";

it("should load data", async () => {
  render(<DataComponent />);

  // Wait for async operations
  await waitFor(() => {
    expect(screen.getByText("Loaded Data")).toBeInTheDocument();
  });
});
```

### 5. Accessibility Testing

```typescript
it("should be accessible", () => {
  const { container } = render(<MyComponent />);

  // Query by role (accessible queries)
  expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();

  // Check ARIA attributes
  expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
});
```

## Migration Guide

### Migrating Old Tests to New Utilities

#### Before: Manual Provider Setup

```typescript
// Old pattern
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

render(
  <QueryClientProvider client={queryClient}>
    <MyComponent />
  </QueryClientProvider>
);
```

#### After: Using Test Utils

```typescript
// New pattern
import { render } from "tests/test-utils";

render(<MyComponent />);
```

#### Before: Custom Formatter Mocks

```typescript
// Old pattern (duplicated in many files)
vi.mock("@/lib/formatters", () => ({
  formatCurrency: vi.fn((amount, options = {}) => {
    const isHidden = typeof options === "boolean" ? options : options.isHidden;
    if (isHidden) return "****";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  }),
  formatNumber: vi.fn(amount => amount.toLocaleString("en-US")),
  // ... more formatters
}));
```

#### After: Centralized Mocks

```typescript
// New pattern
import { mockFormatters } from "tests/test-utils";

vi.mock("@/lib/formatters", () => mockFormatters);
```

### Benefits of Migration

- **40% less test boilerplate**: Centralized utilities eliminate duplication
- **Consistent test setup**: All tests use the same provider configuration
- **Easier maintenance**: Update mocks in one place
- **Better type safety**: TypeScript support for all utilities
- **Faster test writing**: Less setup code per test

### Migration Checklist

- [ ] Replace manual `QueryClientProvider` setup with `render` from test-utils
- [ ] Replace custom formatter mocks with `mockFormatters`
- [ ] Use `renderHook` from test-utils instead of custom wrappers
- [ ] Add `resetFormatterMocks()` in `beforeEach` hooks
- [ ] Update imports to use test-utils

## Running Tests

```bash
# Run all tests
npm test

# Run with watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- WalletMetrics.test.tsx

# Run E2E tests
npm run test:e2e

# Run E2E with UI
npm run test:e2e:ui
```

## Coverage Requirements

- **Unit tests**: Minimum 80% coverage
- **Integration tests**: Critical user flows
- **E2E tests**: Main user journeys

Coverage thresholds are enforced in CI/CD pipeline.

## Debugging Tests

### Debug in VS Code

1. Set breakpoint in test file
2. Run "Debug Test" from Test Explorer
3. Step through code with debugger

### Debug with Console

```typescript
import { screen, debug } from "tests/test-utils";

it("debugs component", () => {
  render(<MyComponent />);

  // Print entire DOM
  screen.debug();

  // Print specific element
  const button = screen.getByRole("button");
  screen.debug(button);
});
```

### Verbose Output

```bash
npm test -- --reporter=verbose
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Testing Library Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Playwright E2E Testing](https://playwright.dev/)

---

_Last updated: 2025-01-17 | Testing utilities v2.0_
