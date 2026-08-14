/**
 * Pure selectors deciding whose activity the Activity screen shows. When
 * viewing the own bundle it uses the connected wallets; when viewing a shared
 * `?userId=` bundle it uses the visited bundle's wallets instead.
 */

/**
 * The userId whose wallets must be fetched for the Activity screen, or null
 * when viewing the own bundle (the own wallets are already available).
 */
export function selectVisitedBundleUserId(input: {
  isOwnBundle: boolean;
  viewingUserId: string | null;
}): string | null {
  return input.isOwnBundle ? null : input.viewingUserId;
}

/**
 * The wallet addresses feeding the activity history: every wallet in the own
 * bundle (falling back to the connected EOA) when viewing your own bundle, or
 * the visited bundle's wallets otherwise. Returns null when no address is
 * available so the history query stays disabled.
 */
export function selectActivityAddressInput(input: {
  isOwnBundle: boolean;
  ownWalletAddresses: string[];
  ownAddress: string | null;
  visitedWalletAddresses: string[];
}): string[] | null {
  if (input.isOwnBundle) {
    if (input.ownWalletAddresses.length > 0) {
      return input.ownWalletAddresses;
    }
    return input.ownAddress ? [input.ownAddress] : null;
  }
  return input.visitedWalletAddresses.length > 0
    ? input.visitedWalletAddresses
    : null;
}
