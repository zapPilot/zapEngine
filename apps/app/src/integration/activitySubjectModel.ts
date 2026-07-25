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
 * The wallet address feeding the activity history: the own bundle's first
 * wallet (falling back to the connected EOA) when viewing your own bundle, or
 * the visited bundle's first wallet otherwise. Returns null while a visited
 * bundle's wallets are still loading so the history query stays disabled.
 */
export function selectActivityAddressInput(input: {
  isOwnBundle: boolean;
  ownWalletAddresses: string[];
  ownAddress: string | null;
  visitedWalletAddresses: string[];
}): string | null {
  if (input.isOwnBundle) {
    return input.ownWalletAddresses[0] ?? input.ownAddress;
  }
  return input.visitedWalletAddresses[0] ?? null;
}
