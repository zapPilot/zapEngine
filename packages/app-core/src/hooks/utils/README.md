# Utility Hooks

Generic, reusable utility functions for React hooks.

## Available Utilities

### invalidateAndRefetch

Utility for invalidating React Query cache and refetching queries.

```typescript
import { invalidateAndRefetch } from '@core/hooks/utils/useQueryInvalidation';

await invalidateAndRefetch({
  queryClient,
  queryKey: ['user', userId],
  refetch,
});
```

**Use cases**: Manual cache invalidation, force refresh after mutations

## Guidelines

- Utility functions should be framework-agnostic where possible
- Each utility should have a single, clear purpose
- Include comprehensive JSDoc with examples
- Test utilities independently
