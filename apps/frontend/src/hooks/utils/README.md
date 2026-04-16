# Utility Hooks

Generic, reusable utility functions for React hooks.

## Available Utilities

### useOperationStateHandlers

Helper functions for managing operation states (loading, error, success).

```typescript
import { useOperationStateHandlers } from "@/hooks/utils";

const { setLoading, setSuccess, setError } = useOperationStateHandlers();
```

**Use cases**: Consistent operation state management across components

### invalidateAndRefetch

Utility for invalidating React Query cache and refetching queries.

```typescript
import { invalidateAndRefetch } from "@/hooks/utils";

await invalidateAndRefetch(queryClient, ["user", userId]);
```

**Use cases**: Manual cache invalidation, force refresh after mutations

## Guidelines

- Utility functions should be framework-agnostic where possible
- Each utility should have a single, clear purpose
- Include comprehensive JSDoc with examples
- Test utilities independently
