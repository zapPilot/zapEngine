/**
 * Error Handling Module
 *
 * Centralized error handling with unified error hierarchy and helper utilities.
 * @module lib/errors
 */

// ============================================================================
// UNIFIED ERROR SYSTEM
// ============================================================================

// Service error classes
export {
  AccountServiceError,
  AnalyticsServiceError,
  BundleServiceError,
  IntentServiceError,
  ServiceError,
} from "./ServiceError";

// ============================================================================
// ERROR UTILITIES
// ============================================================================

// Error helper functions (classification, factory, and message extraction)
export {
  createIntentServiceError,
  extractErrorCode,
  extractErrorMessage,
  extractStatusCode,
  isClientError,
  isRetryableError,
  isServerError,
} from "./errorHelpers";

// Legacy factory utilities (still used in some places)
export { resolveErrorMessage } from "./errorFactory";

// Error handling utilities
export type { ServiceResult } from "./errorHandling";
export { wrapServiceCall } from "./errorHandling";
