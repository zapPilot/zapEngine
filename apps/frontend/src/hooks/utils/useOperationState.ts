import { type Dispatch, type SetStateAction, useCallback } from "react";

/**
 * Operation State Utilities
 *
 * Utilities for managing operation states (loading, error) in hooks.
 * Reduces duplication in mutation handlers.
 */

/**
 * Operation state interface
 * Internal type - not part of public API (consumers should define their own or use wallet.types)
 */
interface OperationState {
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook for managing operation state with standardized handlers
 */
export function useOperationStateHandlers(
  setState: Dispatch<SetStateAction<OperationState>>
) {
  const setLoading = useCallback(
    () => setState({ isLoading: true, error: null }),
    [setState]
  );

  const setSuccess = useCallback(
    () => setState({ isLoading: false, error: null }),
    [setState]
  );

  const setError = useCallback(
    (error: string) => setState({ isLoading: false, error }),
    [setState]
  );

  return { setLoading, setSuccess, setError };
}
