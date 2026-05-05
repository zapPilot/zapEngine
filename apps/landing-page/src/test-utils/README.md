# Test Utils

Index for landing-page test utilities.

## Exports

```typescript
import { render, screen, waitFor } from '@/test-utils';
import { setupWindowMock, createMockStrategy } from '@/test-utils';
```

## Utilities

- `render` — Custom render with providers
- `setupWindowMock.open()` — Mock window.open
- `setupWindowMock.scrollY()` — Mock scroll position
- `setupWindowMock.innerWidth()` — Mock viewport
- `createMockStrategy()` — Create regime strategy
- `createRegimeArcProps()` — Regiment Arc props factory

## Source

Inline JSDoc in source files:

- `render.tsx`
- `mocks/window.ts`
- `fixtures/strategies.ts`
