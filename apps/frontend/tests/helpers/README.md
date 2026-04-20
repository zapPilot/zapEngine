# SwapPage Test Utilities

Comprehensive test helpers for SwapPage and form component testing.

## Overview

The `swapPageTestUtils.ts` file provides a complete testing toolkit for SwapPage and related
components, including:

- **Mock Factories**: Create realistic test data for tokens, strategies, categories, and actions
- **Setup Utilities**: Configure all necessary mocks with a single function call
- **Interaction Helpers**: Simulate user interactions and component callbacks
- **Pre-built Scenarios**: Common test scenarios ready to use
- **Type Guards**: Runtime type validation for test data

## Quick Start

```typescript
import { vi } from "vitest";
import * as UserContext from "@/contexts/UserContext";
import * as useChainModule from "@/hooks/useChain";
import * as useStrategiesQuery from "@/hooks/queries/useStrategiesQuery";
import * as intentService from "@/services/intentService";

import { setupSwapPageMocks, SwapPageTestScenarios } from "tests/helpers/swapPageTestUtils";

// Mock dependencies
vi.mock("@/contexts/UserContext");
vi.mock("@/hooks/useChain");
vi.mock("@/hooks/queries/useStrategiesQuery");
vi.mock("@/services/intentService");

describe("SwapPage", () => {
  it("should handle connected user with strategies", () => {
    // Use pre-built scenario
    const scenario = SwapPageTestScenarios.connectedWithStrategies();
    const mocks = setupSwapPageMocks(scenario);

    // Apply mocks
    vi.mocked(UserContext.useUser).mockReturnValue(mocks.useUser());
    vi.mocked(useChainModule.useChain).mockReturnValue(mocks.useChain());
    vi.mocked(useStrategiesQuery.useStrategiesWithPortfolioData).mockReturnValue(
      mocks.useStrategiesWithPortfolioData()
    );
    vi.mocked(intentService.executeUnifiedZap).mockImplementation(mocks.executeUnifiedZap);

    // Render and test your component
    // ...
  });
});
```

## Mock Factories

### `createMockToken(overrides?)`

Creates a mock SwapToken. Defaults: symbol="USDC", decimals=6, chainId=1, balance=1000.

```typescript
const usdc = createMockToken();
const eth = createMockToken({ symbol: "ETH", decimals: 18, balance: 5.5 });
```

### `createMockProtocol(overrides?)`

Creates a mock protocol. Defaults: name="Aave V3 USDC", chain="Ethereum", apy=3.5.

```typescript
const aave = createMockProtocol();
const compound = createMockProtocol({ name: "Compound V3 USDC", apy: 7.2 });
```

### `createMockAssetCategory(overrides?)`

Creates a mock asset category. Defaults: name="Stablecoins", protocols=[], color="#10b981".

```typescript
const stables = createMockAssetCategory();
const defi = createMockAssetCategory({
  name: "High Yield DeFi",
  protocols: [createMockProtocol({ name: "Aave V3", apy: 5.0 })],
});
```

### `createMockStrategy(overrides?)`

Creates a mock investment strategy. Defaults: name="Conservative Stablecoin Yield", apr=5.5,
risk="Low".

```typescript
const conservative = createMockStrategy();
const highYield = createMockStrategy({ name: "High Yield DeFi", apr: 15.0, risk: "High" });
```

### `createMockSwapAction(overrides?)`

Creates a mock swap action. Defaults: operationMode="zapIn", amount="1000", slippage=0.5.

```typescript
const zapIn = createMockSwapAction();
const zapOut = createMockSwapAction({ operationMode: "zapOut", swapSettings: { amount: "500" } });
```

## Setup Utilities

### `setupSwapPageMocks(config?: SwapPageMockConfig)`

Configures all necessary mocks for SwapPage testing in one function call.

**Configuration Options:**

```typescript
interface SwapPageMockConfig {
  userInfo?: UserInfo | null;
  connectedWallet?: string | null;
  chainId?: number;
  strategies?: AssetCategory[];
  isLoading?: boolean;
  error?: Error | null;
  isInitialLoading?: boolean;
  isRefetching?: boolean;
}
```

**Returns:**

```typescript
{
  useUser: MockFunction,
  useChain: MockFunction,
  useStrategiesWithPortfolioData: MockFunction,
  executeUnifiedZap: MockFunction,
  refetch: MockFunction,
  resetAll: () => void
}
```

**Example:**

```typescript
const mocks = setupSwapPageMocks({
  userInfo: { userId: "user-123", walletAddress: "0xabc" },
  connectedWallet: "0xabc",
  chainId: 1,
  strategies: [createMockAssetCategory()],
});

// Apply mocks to your test
vi.mocked(UserContext.useUser).mockReturnValue(mocks.useUser());
vi.mocked(useChainModule.useChain).mockReturnValue(mocks.useChain());

// Later in your test
expect(mocks.executeUnifiedZap).toHaveBeenCalled();

// Cleanup
mocks.resetAll();
```

## Pre-built Test Scenarios

The `SwapPageTestScenarios` object provides ready-to-use configurations for common test cases.

### Available Scenarios

| Scenario                    | Description                                       |
| --------------------------- | ------------------------------------------------- |
| `connectedWithStrategies()` | Happy path: connected user with loaded strategies |
| `disconnected()`            | User not connected to wallet                      |
| `loading()`                 | Initial loading state                             |
| `error()`                   | Strategy fetch failed                             |
| `emptyStrategies()`         | Connected but no strategies available             |
| `refetching()`              | Background refresh with loaded data               |
| `multiChain()`              | Polygon chain testing                             |

## Interaction Helpers

### `selectOperationMode(container: HTMLElement, mode: OperationMode)`

Simulates clicking an operation mode tab.

```typescript
import { render } from "tests/test-utils";
import { selectOperationMode } from "tests/helpers/swapPageTestUtils";

const { container } = render(<SwapPage {...props} />);
selectOperationMode(container, "zapOut");

expect(screen.getByText(/exit positions/i)).toBeInTheDocument();
```

### `triggerZapAction(onZapAction: Function, action?: PortfolioSwapAction)`

Triggers the onZapAction callback with a custom or default action.

```typescript
const onZapAction = vi.fn();
const customAction = createMockSwapAction({
  operationMode: "zapOut",
  swapSettings: { amount: "500" },
});

triggerZapAction(onZapAction, customAction);

expect(onZapAction).toHaveBeenCalledWith(customAction);
```

## Type Guards

### `isSwapToken(value: unknown): value is SwapToken`

Runtime type validation for SwapToken objects.

```typescript
const token = createMockToken();
if (isSwapToken(token)) {
  // TypeScript knows token is SwapToken
  console.log(token.symbol);
}
```

### `isAssetCategory(value: unknown): value is AssetCategory`

Runtime type validation for AssetCategory objects.

```typescript
const category = createMockAssetCategory();
if (isAssetCategory(category)) {
  // TypeScript knows category is AssetCategory
  console.log(category.name);
}
```

## Query Client Helper

### `createTestQueryClient(): QueryClient`

Creates a test-optimized QueryClient with retries disabled and infinite cache time.

```typescript
import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "tests/helpers/swapPageTestUtils";

const queryClient = createTestQueryClient();

render(
  <QueryClientProvider client={queryClient}>
    <SwapPage {...props} />
  </QueryClientProvider>
);
```

## Best Practices

1. **Use Pre-built Scenarios:** `SwapPageTestScenarios.connectedWithStrategies()` vs manual config
2. **Apply All Mocks:** Use all `mocks.*` functions (`useUser`, `useChain`,
   `useStrategiesWithPortfolioData`)
3. **Clean Up:** Call `mocks.resetAll()` in `afterEach()`
4. **Customize Sparingly:** Only override the fields you need

```typescript
describe("SwapPage", () => {
  let mocks: ReturnType<typeof setupSwapPageMocks>;

  beforeEach(() => {
    mocks = setupSwapPageMocks(SwapPageTestScenarios.connectedWithStrategies());
  });

  afterEach(() => {
    mocks.resetAll();
  });
});
```

## Examples

See `/tests/examples/swapPageTestUtils.example.ts` for comprehensive usage examples including:

- Basic mock setup
- Custom strategies
- Loading and error states
- ZapIn operation testing
- Form validation
- Multi-chain scenarios
- Full integration tests

## Related Files

- `/tests/helpers/swapPageTestUtils.ts` - Main utilities file
- `/tests/unit/helpers/swapPageTestUtils.test.ts` - Unit tests for utilities
- `/tests/examples/swapPageTestUtils.example.ts` - Usage examples
- `/tests/test-utils.tsx` - General test utilities

## Type Definitions

All types are imported from the main codebase:

- `SwapToken` from `@/types/swap`
- `AssetCategory`, `Protocol` from `@/components/PortfolioAllocation/types`
- `InvestmentOpportunity` from `@/types/investment`
- `PortfolioSwapAction` from `@/components/PortfolioAllocation/types`
- `UserInfo` from `@/hooks/queries/useUserQuery`
