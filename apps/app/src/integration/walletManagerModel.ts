import type { WalletData } from '@zapengine/app-core/lib/validation/walletUtils';
import { equalsAddress } from '@zapengine/types/shared';

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
  return wallets.map((wallet) => ({
    id: wallet.id,
    label: wallet.label,
    address: wallet.address,
    isActive: equalsAddress(wallet.address, activeAddress),
  }));
}
