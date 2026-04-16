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

### `createMockToken(overrides?: Partial<SwapToken>): SwapToken`

Creates a mock SwapToken with sensible defaults.

**Default Values:**

- `symbol`: "USDC"
- `decimals`: 6
- `chainId`: 1 (Ethereum)
- `balance`: 1000

**Examples:**

```typescript
// Default USDC token
const usdc = createMockToken();

// Custom ETH token
const eth = createMockToken({
  symbol: "ETH",
  decimals: 18,
  balance: 5.5,
  address: "0x0000000000000000000000000000000000000000",
});

// WBTC token on Polygon
const wbtc = createMockToken({
  symbol: "WBTC",
  decimals: 8,
  chainId: 137,
});
```

### `createMockProtocol(overrides?: Partial<Protocol>): Protocol`

Creates a mock protocol with realistic data.

**Default Values:**

- `name`: "Aave V3 USDC"
- `chain`: "Ethereum"
- `apy`: 3.5
- `allocationPercentage`: 50

**Examples:**

```typescript
// Default Aave protocol
const aave = createMockProtocol();

// Custom Compound protocol
const compound = createMockProtocol({
  name: "Compound V3 USDC",
  protocol: "compound-v3",
  apy: 7.2,
  riskScore: 2,
});
```

### `createMockAssetCategory(overrides?: Partial<AssetCategory>): AssetCategory`

Creates a mock asset category/strategy.

**Default Values:**

- `name`: "Stablecoins"
- `protocols`: []
- `color`: "#10b981"
- `targetAssets`: ["USDC", "USDT", "DAI"]

**Examples:**

```typescript
// Default stablecoin category
const stables = createMockAssetCategory();

// Category with protocols
const categoryWithProtocols = createMockAssetCategory({
  name: "High Yield DeFi",
  protocols: [
    createMockProtocol({ name: "Aave V3", apy: 5.0 }),
    createMockProtocol({ name: "Compound V3", apy: 6.5 }),
  ],
});

// Blue chip category
const blueChips = createMockAssetCategory({
  name: "Blue Chips",
  targetAssets: ["WBTC", "WETH"],
  color: "#3b82f6",
});
```

### `createMockStrategy(overrides?: Partial<InvestmentOpportunity>): InvestmentOpportunity`

Creates a mock investment strategy.

**Default Values:**

- `name`: "Conservative Stablecoin Yield"
- `apr`: 5.5
- `risk`: "Low"
- `category`: "Stablecoins"
- `navigationContext`: "invest"

**Examples:**

```typescript
// Default conservative strategy
const conservative = createMockStrategy();

// High-yield strategy
const highYield = createMockStrategy({
  name: "High Yield DeFi",
  apr: 15.0,
  risk: "High",
  navigationContext: "zapIn",
});
```

### `createMockSwapAction(overrides?: Partial<PortfolioSwapAction>): PortfolioSwapAction`

Creates a mock swap action for testing form submissions.

**Default Values:**

- `operationMode`: "zapIn"
- `swapSettings.amount`: "1000"
- `swapSettings.slippageTolerance`: 0.5

**Examples:**

```typescript
// Default zapIn action
const zapIn = createMockSwapAction();

// Custom zapOut action
const zapOut = createMockSwapAction({
  operationMode: "zapOut",
  swapSettings: {
    amount: "500",
    slippageTolerance: 1.0,
    toToken: createMockToken({ symbol: "USDC" }),
  },
});
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

#### `connectedWithStrategies()`

Happy path scenario with connected user and loaded strategies.

```typescript
const scenario = SwapPageTestScenarios.connectedWithStrategies();
// Returns: { userInfo, connectedWallet, chainId: 1, strategies: [...], isLoading: false }
```

#### `disconnected()`

User not connected to wallet.

```typescript
const scenario = SwapPageTestScenarios.disconnected();
// Returns: { userInfo: null, connectedWallet: null, strategies: [] }
```

#### `loading()`

Initial loading state while fetching strategies.

```typescript
const scenario = SwapPageTestScenarios.loading();
// Returns: { isLoading: true, isInitialLoading: true, strategies: [] }
```

#### `error()`

Error state when strategy fetch fails.

```typescript
const scenario = SwapPageTestScenarios.error();
// Returns: { error: Error('Failed to fetch strategies'), isLoading: false }
```

#### `emptyStrategies()`

Connected user but no available strategies.

```typescript
const scenario = SwapPageTestScenarios.emptyStrategies();
// Returns: { userInfo, connectedWallet, strategies: [], isLoading: false }
```

#### `refetching()`

Background refresh while strategies are already loaded.

```typescript
const scenario = SwapPageTestScenarios.refetching();
// Returns: { strategies: [...], isRefetching: true }
```

#### `multiChain()`

Testing on Polygon chain.

```typescript
const scenario = SwapPageTestScenarios.multiChain();
// Returns: { chainId: 137, strategies with Polygon chains }
```

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

### 1. Use Pre-built Scenarios When Possible

```typescript
// Good: Use pre-built scenario
const scenario = SwapPageTestScenarios.connectedWithStrategies();
const mocks = setupSwapPageMocks(scenario);

// Avoid: Manual configuration when scenario exists
const mocks = setupSwapPageMocks({
  userInfo: { userId: "...", walletAddress: "..." },
  // ... lots of manual config
});
```

### 2. Apply All Mocks Consistently

```typescript
// Good: Apply all related mocks
vi.mocked(UserContext.useUser).mockReturnValue(mocks.useUser());
vi.mocked(useChainModule.useChain).mockReturnValue(mocks.useChain());
vi.mocked(useStrategiesQuery.useStrategiesWithPortfolioData).mockReturnValue(
  mocks.useStrategiesWithPortfolioData()
);

// Avoid: Forgetting some mocks (will cause undefined errors)
vi.mocked(UserContext.useUser).mockReturnValue(mocks.useUser());
// Missing other mocks...
```

### 3. Clean Up After Tests

```typescript
describe("SwapPage", () => {
  let mocks: ReturnType<typeof setupSwapPageMocks>;

  beforeEach(() => {
    mocks = setupSwapPageMocks(SwapPageTestScenarios.connectedWithStrategies());
    // Apply mocks...
  });

  afterEach(() => {
    mocks.resetAll(); // Clean up
  });

  it("should do something", () => {
    // Test...
  });
});
```

### 4. Customize Only What You Need

```typescript
// Good: Customize only relevant fields
const token = createMockToken({ symbol: "ETH", decimals: 18 });

// Avoid: Over-specifying defaults
const token = createMockToken({
  symbol: "ETH",
  decimals: 18,
  chainId: 1, // Default value, not needed
  balance: 1000, // Default value, not needed
  // ... many more defaults
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

## Contributing

When adding new test utilities:

1. Add JSDoc comments explaining usage
2. Provide realistic default values
3. Include examples in the documentation
4. Add unit tests in `swapPageTestUtils.test.ts`
5. Update this README with new utilities

## License

Part of the Zap Pilot test suite.
