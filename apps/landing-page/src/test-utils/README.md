# Test Utilities

Centralized testing utilities for consistent test patterns across the codebase.

## Overview

This directory provides reusable testing helpers to reduce boilerplate and establish clear patterns:

- **Custom Render** (`render.tsx`) - Renders components with necessary providers
- **Window Mocks** (`mocks/window.ts`) - Helpers for mocking window properties
- **Regime Fixtures** (`fixtures/regime.ts`) - Factories for regime component test data
- **Next Router Mocks** (`mocks/next-router.ts`) - Router mocking for navigation tests

## Installation

All utilities are exported from `@/test-utils` for easy importing:

```typescript
import { render, screen, setupWindowMock, createMockStrategy } from '@/test-utils';
```

## Usage Guide

### Custom Render

Import from `@/test-utils` instead of `@testing-library/react`:

```typescript
import { render, screen, waitFor } from '@/test-utils';

it('renders component', () => {
  render(<MyComponent />);
  expect(screen.getByText('Hello')).toBeInTheDocument();
});
```

### Window Property Mocking

#### window.open

Mock window.open for testing external link navigation:

```typescript
import { setupWindowMock } from '@/test-utils';

describe('ExternalLink', () => {
  it('opens link in new tab', () => {
    const mockWindowOpen = setupWindowMock.open();

    render(<ExternalLink url="https://example.com" />);
    fireEvent.click(screen.getByRole('button'));

    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://example.com',
      '_blank',
      'noopener,noreferrer'
    );
  });
});
```

**Before** (6 lines):

```typescript
const mockWindowOpen = jest.fn();
Object.defineProperty(window, 'open', {
  writable: true,
  value: mockWindowOpen,
});
```

**After** (2 lines):

```typescript
import { setupWindowMock } from '@/test-utils';
const mockWindowOpen = setupWindowMock.open();
```

#### window.scrollY

Mock scroll position for testing scroll-based behavior:

```typescript
import { setupWindowMock } from '@/test-utils';
import { act } from '@/test-utils';

describe('ScrollComponent', () => {
  it('changes on scroll', () => {
    const scroll = setupWindowMock.scrollY(0);

    render(<ScrollComponent />);

    act(() => {
      scroll.set(100);
      window.dispatchEvent(new Event('scroll'));
    });

    expect(screen.getByText('Scrolled!')).toBeInTheDocument();
    expect(scroll.get()).toBe(100);
  });
});
```

#### window.innerWidth

Mock viewport width for testing responsive behavior:

```typescript
import { setupWindowMock } from '@/test-utils';

describe('ResponsiveComponent', () => {
  it('renders mobile layout', () => {
    const width = setupWindowMock.innerWidth(500);

    render(<ResponsiveComponent />);
    expect(screen.getByTestId('mobile-nav')).toBeInTheDocument();
  });

  it('renders desktop layout', () => {
    const width = setupWindowMock.innerWidth(1200);

    render(<ResponsiveComponent />);
    expect(screen.getByTestId('desktop-nav')).toBeInTheDocument();
  });
});
```

### Regime Test Fixtures

#### Creating Mock Strategies

Create regime strategies for testing allocation changes:

```typescript
import { createMockStrategy, createMaintainingStrategy } from '@/test-utils';

describe('AllocationPanel', () => {
  it('shows allocation change', () => {
    const strategy = createMockStrategy({
      title: 'Aggressive Accumulation',
      useCase: {
        allocationAfter: { spot: 80, lp: 0, stable: 20 }
      }
    });

    render(<AllocationPanel strategy={strategy} />);
    // ...assertions
  });

  it('shows no change for maintaining strategy', () => {
    const maintaining = createMaintainingStrategy();

    render(<AllocationPanel strategy={maintaining} />);
    expect(screen.getByText('Maintaining current allocation')).toBeInTheDocument();
  });
});
```

#### RegimeArc Component Props

Reduce boilerplate when testing RegimeArc:

```typescript
import { createRegimeArcProps } from '@/test-utils';

describe('RegimeArc', () => {
  it('renders active regime', () => {
    const props = createRegimeArcProps({ activeRegime: 'ef' });

    render(<svg><RegimeArc {...props} /></svg>);
    // ...assertions
  });

  it('handles mobile layout', () => {
    const props = createRegimeArcProps({
      activeRegime: 'n',
      isMobile: true
    });

    render(<svg><RegimeArc {...props} /></svg>);
    // ...assertions
  });
});
```

**Before** (10+ lines):

```typescript
const defaultProps = {
  activeRegime: 'n' as RegimeId,
  calculatePosition: jest.fn((index: number) => ({
    x: 100 + index * 100,
    y: 200,
  })),
  isMobile: false,
  onRegimeClick: jest.fn(),
  isAutoPlaying: false,
  animationDirection: 'forward' as const,
};
```

**After** (1 line):

```typescript
const props = createRegimeArcProps();
```

#### AllocationPanel Component Props

Comprehensive props factory for AllocationPanel:

```typescript
import { createAllocationPanelProps, createMaintainingStrategy } from '@/test-utils';

describe('AllocationPanel', () => {
  it('renders with default props', () => {
    const props = createAllocationPanelProps();

    render(<svg><AllocationPanel {...props} /></svg>);
    // ...assertions
  });

  it('renders mobile layout', () => {
    const props = createAllocationPanelProps({
      isMobile: true,
      activeStrategy: createMaintainingStrategy()
    });

    render(<svg><AllocationPanel {...props} /></svg>);
    // ...assertions
  });
});
```

## Migration Guide

### When to Use Utilities

✅ **Use utilities when:**

- Testing common window property interactions (open, scroll, resize)
- Testing regime visualizer components
- Setting up standard test scenarios
- You need type-safe test helpers

❌ **Don't use utilities when:**

- Need highly custom mock behavior not covered by helpers
- Testing edge cases requiring specific non-standard setup
- Mock needs configuration beyond what overrides provide
- Inline mock is clearer for one-off scenarios

### Migration is Optional

Both old and new patterns work. Migrate gradually:

1. **New tests**: Use utilities from the start
2. **Existing tests**: Migrate when touching the file for other reasons
3. **No rush**: Old patterns continue working fine

### Migration Examples

#### Hero.test.tsx Migration

**Before**:

```typescript
const mockWindowOpen = jest.fn();
Object.defineProperty(window, 'open', {
  writable: true,
  value: mockWindowOpen,
});

describe('Hero', () => {
  beforeEach(() => {
    mockWindowOpen.mockClear();
  });

  it('opens app link', () => {
    render(<Hero />);
    fireEvent.click(screen.getByRole('button', { name: /launch app/i }));
    expect(mockWindowOpen).toHaveBeenCalled();
  });
});
```

**After**:

```typescript
import { setupWindowMock } from '@/test-utils';

describe('Hero', () => {
  it('opens app link', () => {
    const mockWindowOpen = setupWindowMock.open();

    render(<Hero />);
    fireEvent.click(screen.getByRole('button', { name: /launch app/i }));
    expect(mockWindowOpen).toHaveBeenCalled();
  });
});
```

## Best Practices

### 1. Import from @/test-utils

Always use the barrel export:

```typescript
// ✅ Good
import { render, setupWindowMock, createMockStrategy } from '@/test-utils';

// ❌ Avoid
import { setupWindowMock } from '@/test-utils/mocks/window';
```

### 2. Use Factories with Overrides

Keep tests DRY while maintaining flexibility:

```typescript
// ✅ Good - use factory with overrides
const strategy = createMockStrategy({
  useCase: { allocationAfter: { spot: 90, lp: 0, stable: 10 } },
});

// ❌ Avoid - defining entire object inline
const strategy = {
  title: 'Mock',
  useCase: {
    scenario: '...',
    userIntent: '...',
    // ... 10 more lines
  },
};
```

### 3. Clean Up Mocks

Reset mocks between tests to avoid pollution:

```typescript
describe('MyComponent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('test 1', () => {
    const mockWindowOpen = setupWindowMock.open();
    // ...
  });
});
```

### 4. Type Safety

Utilities provide full TypeScript support:

```typescript
import { createRegimeArcProps, type RegimeArcProps } from '@/test-utils';

// TypeScript ensures you only pass valid properties
const props: RegimeArcProps = createRegimeArcProps({
  activeRegime: 'ef', // ✅ Valid RegimeId
  isMobile: true,
  // invalidProp: 'oops' // ❌ TypeScript error
});
```

## Available Utilities

### Window Mocks

- `setupWindowMock.open()` - Mock window.open
- `setupWindowMock.scrollY(initial?)` - Mock window.scrollY
- `setupWindowMock.innerWidth(initial?)` - Mock window.innerWidth
- `setupWindowMock.matchMedia(query, matches?)` - Mock matchMedia

### Regime Fixtures

- `createMockStrategy(overrides?)` - Create regime strategy with allocation change
- `createMaintainingStrategy()` - Create strategy without change
- `getRegimeById(id)` - Get regime data by ID
- `createRegimeArcProps(overrides?)` - Props for RegimeArc component
- `createAllocationPanelProps(overrides?)` - Props for AllocationPanel component
- `createAllocation(partial)` - Create allocation breakdown
- `MOCK_PANEL_POSITIONS` - Common panel positions (desktop/mobile/tablet)

### RTL Re-exports

- `render` - Custom render with providers
- `screen` - Query elements
- `waitFor` - Async utilities
- `within` - Scoped queries
- `act` - Wrap state updates

## Framer Motion Mocking

Framer Motion is mocked **globally** in `jest.setup.js`. You don't need to import or configure it in individual test files.

```typescript
// ✅ Works automatically
import { motion } from 'framer-motion';

it('renders motion component', () => {
  render(<motion.div>Content</motion.div>);
  expect(screen.getByText('Content')).toBeInTheDocument();
});
```

## Need Help?

If you encounter issues or need additional utilities:

1. Check this README for examples
2. Look at existing test files using the utilities
3. Propose new utilities if you find repeated patterns

---

_Happy testing! 🧪_
