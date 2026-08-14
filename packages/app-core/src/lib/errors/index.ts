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
} from './ServiceError';

// ============================================================================
// ERROR UTILITIES
// ============================================================================

// Error helper functions (classification and message extraction)
export { extractErrorMessage, isClientError } from './errorHelpers';

// Error handling utilities
export type { ServiceResult } from './errorHandling';
export { wrapServiceCall } from './errorHandling';
