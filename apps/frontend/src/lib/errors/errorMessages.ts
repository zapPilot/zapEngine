/**
 * Centralized Error Messages
 *
 * Provides consistent, user-friendly error messages across all services.
 * Consolidates duplicate getUserMessage() logic from error classes.
 *
 * @module lib/errorMessages
 */

// =============================================================================
// TYPES
// =============================================================================

type ErrorSource =
  | "backend-service"
  | "intent-service"
  | "account-service"
  | "analytics-service"
  | "token-service"
  | "price-service"
  | "balance-service"
  | "unknown";

interface ErrorMessageContext {
  /** HTTP status code */
  status: number;
  /** Original error message from API */
  message?: string;
  /** Error code for specific scenarios */
  code?: string;
  /** Service that generated the error */
  source?: ErrorSource;
}

// =============================================================================
// HTTP STATUS CODE MESSAGES
// =============================================================================

/**
 * Standard HTTP status code messages
 * These apply across all services unless overridden
 */
const HTTP_STATUS_MESSAGES: Record<number, string> = {
  // Client Errors (4xx)
  400: "Invalid request. Please check your input.",
  401: "Authentication required. Please connect your wallet.",
  403: "You don't have permission to perform this action.",
  404: "Resource not found.",
  405: "This operation is not allowed.",
  408: "Request timeout. Please try again.",
  409: "Resource already exists or conflict detected.",
  422: "Invalid request data. Please check your input and try again.",
  429: "Too many requests. Please wait before trying again.",

  // Server Errors (5xx)
  500: "Internal server error. Please try again later.",
  502: "Service temporarily unavailable. Please try again.",
  503: "Service is under maintenance. Please try again later.",
  504: "Request timeout. The service took too long to respond.",
};

// =============================================================================
// SERVICE-SPECIFIC ERROR PATTERNS
// =============================================================================

/**
 * Backend Service error patterns
 * Handles notifications, reports, and backend operations
 */
const BACKEND_SERVICE_PATTERNS: Record<
  number,
  Record<string, string> | string
> = {
  400: {
    email: "Invalid email address format.",
    webhook: "Invalid Discord webhook configuration.",
    default: "Invalid request. Please check your input.",
  },
  429: "Too many notification requests. Please wait before sending more.",
  502: "External notification service is temporarily unavailable.",
  503: "Notification service is temporarily unavailable.",
};

/**
 * Intent Service error patterns
 * Handles transaction execution and intent processing
 */
const INTENT_SERVICE_PATTERNS: Record<number, Record<string, string> | string> =
  {
    400: {
      slippage: "Invalid slippage tolerance. Must be between 0.1% and 50%.",
      amount: "Invalid transaction amount. Please check your balance.",
      default: "Invalid transaction parameters.",
    },
    429: "Too many transactions in progress. Please wait before submitting another.",
    503: "Intent engine is temporarily overloaded. Please try again in a moment.",
  };

/**
 * Account Service error patterns
 * Handles user account and wallet management
 */
const ACCOUNT_SERVICE_PATTERNS: Record<
  number,
  Record<string, string> | string
> = {
  400: {
    address:
      "Invalid wallet address format. Address must be 42 characters long.",
    "main wallet": "Cannot remove the main wallet from your bundle.",
    default: "Invalid request parameters.",
  },
  404: "User or wallet not found.",
  409: {
    wallet: "This wallet is already in your bundle.",
    email: "This email address is already in use.",
    default: "Resource already exists.",
  },
};

/**
 * Service-specific pattern mappings
 */
const SERVICE_PATTERNS: Record<
  ErrorSource,
  Record<number, Record<string, string> | string>
> = {
  "backend-service": BACKEND_SERVICE_PATTERNS,
  "intent-service": INTENT_SERVICE_PATTERNS,
  "account-service": ACCOUNT_SERVICE_PATTERNS,
  "analytics-service": {},
  "token-service": {},
  "price-service": {},
  "balance-service": {},
  unknown: {},
};

// =============================================================================
// ERROR MESSAGE RESOLUTION
// =============================================================================

/**
 * Find matching pattern in error message
 *
 * @param message - Original error message
 * @param patterns - Pattern to user message mapping
 * @returns Matched user message or null
 */
function findMessagePattern(
  message: string | undefined,
  patterns: Record<string, string> | string
): string | null {
  if (typeof patterns === "string") return patterns;
  if (!message) return null;

  const lowerMessage = message.toLowerCase();

  // Check each pattern
  for (const [pattern, userMessage] of Object.entries(patterns)) {
    if (pattern !== "default" && lowerMessage.includes(pattern.toLowerCase())) {
      return userMessage;
    }
  }

  // Return default if exists
  return patterns["default"] || null;
}

/**
 * Get user-friendly error message based on context
 *
 * Resolution order:
 * 1. Service-specific pattern match (e.g., "slippage" → specific message)
 * 2. Service-specific status code message
 * 3. Generic HTTP status message
 * 4. Original error message
 * 5. Fallback message
 *
 * @param context - Error context with status, message, and source
 * @returns User-friendly error message
 *
 * @example
 * ```typescript
 * // Service-specific pattern match
 * getErrorMessage({
 *   status: 400,
 *   message: "Invalid slippage value",
 *   source: "intent-service"
 * })
 * // Returns: "Invalid slippage tolerance. Must be between 0.1% and 50%."
 *
 * // Generic HTTP status
 * getErrorMessage({ status: 404 })
 * // Returns: "Resource not found."
 *
 * // Fallback to original message
 * getErrorMessage({
 *   status: 500,
 *   message: "Database connection failed"
 * })
 * // Returns: "Database connection failed"
 * ```
 */
export function getErrorMessage(context: ErrorMessageContext): string {
  const { status, message, source = "unknown" } = context;

  // 1. Try service-specific pattern matching
  if (source !== "unknown") {
    const servicePatterns = SERVICE_PATTERNS[source];
    const statusPatterns = servicePatterns[status];

    if (statusPatterns) {
      const matched = findMessagePattern(message, statusPatterns);
      if (matched) return matched;
    }
  }

  // 2. Try generic HTTP status message
  const httpMessage = HTTP_STATUS_MESSAGES[status];
  if (httpMessage) return httpMessage;

  // 3. Fall back to original message
  if (message && message.trim().length > 0) {
    return message;
  }

  // 4. Final fallback
  return "An unexpected error occurred. Please try again.";
}

/**
 * Factory function to create service-specific error message getters
 * @param source - The service source identifier
 * @returns A function that gets error messages for the specified source
 */
function createSourceErrorMessage(source: ErrorSource) {
  return (status: number, message?: string): string =>
    getErrorMessage({
      status,
      ...(message !== undefined && { message }),
      source,
    });
}

/**
 * Get error message for intent service
 * Convenience wrapper for getErrorMessage with source set to "intent-service"
 */
export const getIntentErrorMessage = createSourceErrorMessage("intent-service");
