/**
 * Bundle Service - Handles bundle metadata and sharing functionality
 *
 * Architecture: Service layer for async API calls only
 * Pure utilities moved to @/lib/bundle for better separation of concerns
 */

import { formatAddress } from "@/utils/formatters";

export { generateBundleUrl, isOwnBundle } from "@/lib/bundle/bundleUtils";

export interface BundleUser {
  userId: string;
  displayName?: string;
  avatar?: string;
}

/**
 * Get user information for a bundle
 *
 * @param userId - User wallet address
 * @returns User information with formatted display name
 */
export function getBundleUser(userId: string): BundleUser {
  return {
    userId,
    displayName: formatAddress(userId),
  };
}
