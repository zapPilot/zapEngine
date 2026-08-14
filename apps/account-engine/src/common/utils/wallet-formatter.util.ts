import {
  shortenAddress,
  type ShortenAddressOptions,
} from '@zapengine/types/shared';

import { isWalletAddress } from '../validation/wallet-address.util';

/**
 * Formats a wallet address to a shortened display format (default 0x1234...abcd).
 * Pass `{ head, tail }` for higher-fidelity contexts (e.g. trade alerts: 8/6).
 *
 * @returns Shortened wallet address, or the original string if it's not a valid address.
 */
export function formatShortWalletAddress(
  address: string,
  options?: ShortenAddressOptions,
): string {
  if (!isWalletAddress(address)) {
    return address;
  }

  return shortenAddress(address, options);
}

/**
 * Truncates a wallet address for safe logging (first 10 chars)
 * @param address - The wallet address to truncate
 * @returns First 10 characters of the address
 */
export function truncateForLog(address: string): string {
  return address.slice(0, 10);
}

/**
 * Generates a default label for a wallet using shortened address format
 * @param wallet - The wallet address
 * @returns Default label in format "Wallet 0x1234...abcd"
 */
export function generateDefaultWalletLabel(wallet: string): string {
  return `Wallet ${formatShortWalletAddress(wallet)}`;
}
