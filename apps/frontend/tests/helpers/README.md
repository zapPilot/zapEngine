# SwapPage Test Utils

Index for `swapPageTestUtils.ts`. See inline JSDoc for full API docs.

## Quick Start

```typescript
import { vi } from 'vitest';
import {
  setupSwapPageMocks,
  SwapPageTestScenarios,
} from 'tests/helpers/swapPageTestUtils';

describe('SwapPage', () => {
  it('test', () => {
    const mocks = setupSwapPageMocks(
      SwapPageTestScenarios.connectedWithStrategies(),
    );
    // use mocks...
  });
});
```

## Exports

- `createMockToken()` — Mock SwapToken
- `createMockStrategy()` — Mock investment strategy
- `createMockAssetCategory()` — Mock asset category
- `setupSwapPageMocks(config?)` — Full mock setup
- `SwapPageTestScenarios.*` — Pre-built scenarios

## Source

`tests/helpers/swapPageTestUtils.ts` — Full API docs in JSDoc comments.
