import { toErrorMessage } from "./errors.js";

export interface HealthCheckResult {
  status: "healthy" | "unhealthy";
  details?: string;
}

/**
 * Simple wrapper for health check functions with standardized error handling
 *
 * Eliminates duplicate try/catch patterns across fetchers
 *
 * @param healthCheckFn - Async function that performs the health check
 * @returns Promise resolving to HealthCheckResult
 *
 * @example
 * ```typescript
 * async healthCheck(): Promise<HealthCheckResult> {
 *   return wrapHealthCheck(async () => {
 *     await this.fetch('/health');
 *     return { status: 'healthy' };
 *   });
 * }
 * ```
 */
export async function wrapHealthCheck(
  healthCheckFn: () => Promise<HealthCheckResult>,
): Promise<HealthCheckResult> {
  try {
    return await healthCheckFn();
  } catch (error) {
    return {
      status: "unhealthy",
      details: toErrorMessage(error),
    };
  }
}

export function formatHealthComponent(
  label: string,
  status: string,
  details?: string,
): string {
  return `${label}: ${status}${details ? ` (${details})` : ""}`;
}

export async function wrapCompositeHealthCheck(
  checks: Array<{ label: string; check: () => Promise<HealthCheckResult> }>,
): Promise<HealthCheckResult> {
  try {
    const results = await Promise.all(
      checks.map(async ({ label, check }) => ({
        label,
        result: await check(),
      })),
    );

    const unhealthy = results.some(
      ({ result }) => result.status === "unhealthy",
    );

    if (!unhealthy) {
      return { status: "healthy" };
    }

    return {
      status: "unhealthy",
      details: results
        .map(({ label, result }) =>
          formatHealthComponent(label, result.status, result.details),
        )
        .join(", "),
    };
  } catch (error) {
    return {
      status: "unhealthy",
      details: toErrorMessage(error),
    };
  }
}
