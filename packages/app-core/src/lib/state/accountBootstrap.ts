const suspendedWallets = new Set<string>();

function normalizeWallet(wallet: string): string {
  return wallet.trim().toLowerCase();
}

/**
 * Prevents the current connected wallet from bootstrapping a Zap Pilot account.
 * Used while an account is being torn down so a remount cannot recreate the
 * record before the wallet session has actually disconnected.
 */
export function suspendAccountBootstrap(wallet: string): void {
  const normalized = normalizeWallet(wallet);
  if (normalized) {
    suspendedWallets.add(normalized);
  }
}

/** Re-enables account bootstrap after the wallet session has disconnected. */
export function resumeAccountBootstrap(wallet: string): void {
  suspendedWallets.delete(normalizeWallet(wallet));
}

export function isAccountBootstrapSuspended(
  wallet: string | null | undefined,
): boolean {
  return wallet ? suspendedWallets.has(normalizeWallet(wallet)) : false;
}
