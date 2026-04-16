/**
 * Unified Service Error Types
 * Single source of truth for service-level error handling
 *
 * @see Phase 7 - Error Handling Unification
 */

/**
 * Base service error class
 * All service errors inherit from this class
 */
export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

type ServiceErrorConstructorArgs = ConstructorParameters<typeof ServiceError>;

function createServiceErrorClass(name: string) {
  return class extends ServiceError {
    constructor(...args: ServiceErrorConstructorArgs) {
      super(...args);
      this.name = name;
    }
  };
}

/**
 * Account-specific service errors
 */
export class AccountServiceError extends createServiceErrorClass(
  "AccountServiceError"
) {}

/**
 * Analytics-specific service errors
 */
export class AnalyticsServiceError extends createServiceErrorClass(
  "AnalyticsServiceError"
) {}

/**
 * Intent-specific service errors (ZapIn, ZapOut, Optimize)
 */
export class IntentServiceError extends createServiceErrorClass(
  "IntentServiceError"
) {}

/**
 * Bundle-specific service errors
 */
export class BundleServiceError extends createServiceErrorClass(
  "BundleServiceError"
) {}
