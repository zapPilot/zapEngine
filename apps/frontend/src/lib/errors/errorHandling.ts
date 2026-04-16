/**
 * Error Handling Utilities
 *
 * Centralized error handling patterns to reduce code duplication.
 * Provides consistent error handling across service functions.
 */

/**
 * Standard service response type with success flag and optional error
 */
export interface ServiceResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Wraps an async operation with try-catch and returns standardized result
 *
 * @param operation - Async function to execute
 * @returns ServiceResult with success flag and optional error message
 *
 * @example
 * ```ts
 * // With return value
 * export async function getUser(userId: string) {
 *   return wrapServiceCall(async () => {
 *     return await fetchUser(userId);
 *   });
 * }
 *
 * // Without return value (void)
 * export async function removeWallet(userId: string, walletId: string) {
 *   return wrapServiceCall(async () => {
 *     await removeWalletFromBundle(userId, walletId);
 *   });
 * }
 * ```
 */
export async function wrapServiceCall<T = void>(
  operation: () => Promise<T>
): Promise<ServiceResult<T>> {
  try {
    const data = await operation();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
