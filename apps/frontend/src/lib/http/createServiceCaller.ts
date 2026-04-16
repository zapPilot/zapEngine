/**
 * Service Caller Factory
 *
 * Creates reusable service call wrappers that handle error mapping.
 * Consolidates duplicated service wrapper pattern across all service files.
 *
 * @module lib/http/createServiceCaller
 */

import { APIError } from "@/lib/http/errors";
import { createErrorMapper } from "@/lib/http/serviceErrorFactory";

/**
 * Creates a service caller with consistent error mapping.
 *
 * @param errorMapper - Function to transform errors into service-specific error types
 * @returns A function that wraps service calls with error handling
 *
 * @example
 * ```typescript
 * const callAccountApi = createServiceCaller(createAccountServiceError);
 * export const getUserProfile = (userId: string) =>
 *   callAccountApi(() => accountApiClient.get(`/users/${userId}`));
 * ```
 */
export function createServiceCaller<TError extends Error>(
  errorMapper: (error: unknown) => TError
): <T>(call: () => Promise<T>) => Promise<T> {
  return async function callService<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      throw errorMapper(error);
    }
  };
}

/**
 * Combined factory for creating API service callers with error mapping.
 *
 * Eliminates the repeated boilerplate of wiring `createErrorMapper` with
 * the identical `APIError` factory lambda used across all service files.
 *
 * @param statusMessages - Map of HTTP status codes to user-friendly error messages
 * @param defaultMessage - Fallback message when no status-specific message matches
 * @returns A service caller function that wraps async calls with error handling
 *
 * @example
 * ```typescript
 * const callMyApi = createApiServiceCaller(
 *   { 400: "Invalid request", 404: "Not found" },
 *   "Service request failed"
 * );
 *
 * export async function fetchData(): Promise<Data> {
 *   return callMyApi(() => httpUtils.analyticsEngine.get("/api/data"));
 * }
 * ```
 */
export function createApiServiceCaller(
  statusMessages: Record<number, string>,
  defaultMessage: string
) {
  return createServiceCaller(
    createErrorMapper(
      (message, status, code, details) =>
        new APIError(message, status, code, details),
      statusMessages,
      defaultMessage
    )
  );
}
