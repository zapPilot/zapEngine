/**
 * Bundle Utilities
 * Pure functions for bundle URL operations
 *
 * Architecture: Pure utility functions separated from API service layer
 * These functions have no side effects and perform only URL/state operations
 */

/**
 * Generate bundle URL for sharing
 * @param userId - User wallet address (required)
 * @param walletId - Specific wallet address (optional, V22 Phase 2A)
 * @param baseUrl - Base URL (optional, defaults to relative path for SSR consistency)
 *
 * Note: Returns relative path by default to avoid SSR hydration mismatch.
 * Pass explicit baseUrl for absolute URLs (e.g., for sharing to external services).
 *
 * @example
 * // Relative URL (default, SSR-safe)
 * generateBundleUrl('0x1234...5678')
 * // => '/bundle?userId=0x1234...5678'
 *
 * // With wallet filter
 * generateBundleUrl('0x1234...5678', '0x9ABC...DEF0')
 * // => '/bundle?userId=0x1234...5678&walletId=0x9ABC...DEF0'
 *
 * // Absolute URL for external sharing
 * generateBundleUrl('0x1234...5678', undefined, 'https://example.com')
 * // => 'https://example.com/bundle?userId=0x1234...5678'
 */
export function generateBundleUrl(
  userId: string,
  walletId?: string,
  baseUrl?: string
): string {
  const params = new URLSearchParams({ userId });

  if (walletId) {
    params.set("walletId", walletId);
  }

  const path = `/bundle?${params.toString()}`;

  // Only prefix with baseUrl if explicitly provided
  // This avoids SSR hydration mismatch (server has no window.location)
  if (baseUrl) {
    return `${baseUrl}${path}`;
  }

  return path;
}

/**
 * Check if current user owns the bundle
 *
 * Pure function to determine bundle ownership by comparing user IDs
 *
 * @param bundleUserId - The user ID from the bundle URL parameter
 * @param currentUserId - The currently connected wallet address (null if disconnected)
 * @returns True if the current user owns the bundle
 *
 * @example
 * // Owner viewing their own bundle
 * isOwnBundle('0x1234...5678', '0x1234...5678')
 * // => true
 *
 * // Visitor viewing someone else's bundle
 * isOwnBundle('0x1234...5678', '0x9ABC...DEF0')
 * // => false
 *
 * // Disconnected user viewing bundle
 * isOwnBundle('0x1234...5678', null)
 * // => false
 */
export function isOwnBundle(
  bundleUserId: string,
  currentUserId?: string | null
): boolean {
  return !!currentUserId && currentUserId === bundleUserId;
}
