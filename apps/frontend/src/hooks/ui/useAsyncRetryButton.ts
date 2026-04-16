import { useCallback, useState } from "react";

interface UseAsyncRetryButtonOptions {
  onRetry: () => Promise<void>;
  errorContext: string;
  logger?: { error: (message: string, error: unknown) => void };
}

/**
 * Hook for handling async retry button with error handling
 * Prevents floating promises and provides consistent loading state
 *
 * @example
 * ```tsx
 * const { handleRetry, isRetrying } = useAsyncRetryButton({
 *   onRetry: async () => await refetch(),
 *   errorContext: "refetch data",
 *   logger: myLogger,
 * });
 *
 * <button onClick={handleRetry} disabled={isRetrying}>
 *   {isRetrying ? "Retrying..." : "Try Again"}
 * </button>
 * ```
 */
export function useAsyncRetryButton({
  onRetry,
  errorContext,
  logger,
}: UseAsyncRetryButtonOptions) {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = useCallback(() => {
    setIsRetrying(true);
    void (async () => {
      try {
        await onRetry();
      } catch (error) {
        logger?.error(`Failed to ${errorContext}`, error);
      } finally {
        setIsRetrying(false);
      }
    })();
  }, [onRetry, logger, errorContext]);

  return { handleRetry, isRetrying };
}
