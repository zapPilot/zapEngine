import { type QueryClient } from "@tanstack/react-query";

import { walletLogger } from "@/utils";

/**
 * Query Invalidation Utilities
 *
 * Centralized utilities for handling React Query invalidation and refetch operations.
 * Reduces code duplication across mutation hooks.
 */

interface InvalidateAndRefetchOptions {
  queryClient: QueryClient;
  queryKey: readonly unknown[];
  refetch: () => Promise<unknown>;
  operationName?: string;
}

function logQueryOperationError(
  errorPrefix: string,
  operationName: string,
  error: unknown
): void {
  walletLogger.error(`${errorPrefix} after ${operationName}`, error);
}

/**
 * Safely invalidates query cache and refetches data after a mutation.
 * Handles errors gracefully without throwing.
 *
 * @param options - Configuration for invalidation and refetch
 */
export async function invalidateAndRefetch({
  queryClient,
  queryKey,
  refetch,
  operationName = "operation",
}: InvalidateAndRefetchOptions): Promise<void> {
  try {
    await queryClient.invalidateQueries({ queryKey });
  } catch (invalidateError) {
    logQueryOperationError(
      "Failed to invalidate queries",
      operationName,
      invalidateError
    );
  }

  try {
    await refetch();
  } catch (refetchError) {
    logQueryOperationError(
      "Failed to refetch data",
      operationName,
      refetchError
    );
  }
}
