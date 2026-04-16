/**
 * HTTP Error Handler
 * User-facing error message formatting
 */

import { APIError, NetworkError, TimeoutError } from "./errors";

/**
 * Common error handler function
 */
export function handleHTTPError(error: unknown): string {
  if (error instanceof APIError) {
    // Handle specific error codes
    switch (error.code) {
      case "USER_NOT_FOUND":
        return "User not found. Please connect your wallet first.";
      case "INVALID_ADDRESS":
        return "Invalid wallet address provided.";
      case "RATE_LIMITED":
        return "Too many requests. Please try again later.";
      default:
        return error.message;
    }
  }

  if (error instanceof NetworkError) {
    return "Network connection failed. Please check your internet connection.";
  }

  if (error instanceof TimeoutError) {
    return "Request timed out. Please try again.";
  }

  return "An unexpected error occurred. Please try again.";
}
