import type { WalletData } from '@zapengine/app-core/lib/validation/walletUtils';

export interface WalletRowVM {
  id: string;
  label: string;
  address: string;
  isActive: boolean;
}

/**
 * Bundle wallets are stored checksum-cased while the connected signing EOA
 * arrives lowercase from the wallet backend — compare case-insensitively.
 */
export function toWalletRows(
  wallets: readonly WalletData[],
  activeAddress: string | null,
): WalletRowVM[] {
  const active = activeAddress?.toLowerCase() ?? null;
  return wallets.map((wallet) => ({
    id: wallet.id,
    label: wallet.label,
    address: wallet.address,
    isActive: active !== null && wallet.address.toLowerCase() === active,
  }));
}
