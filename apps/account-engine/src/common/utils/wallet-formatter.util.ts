import { isWalletAddress } from '../validation/wallet-address.util';

export interface FormatShortWalletAddressOptions {
  /** Characters from the start of the address (including `0x`). Default 6. */
  head?: number;
  /** Characters from the end of the address. Default 4. */
  tail?: number;
}

/**
 * Formats a wallet address to a shortened display format (default 0x1234...abcd).
 * Pass `{ head, tail }` for higher-fidelity contexts (e.g. trade alerts: 8/6).
 *
 * @returns Shortened wallet address, or the original string if it's not a valid address.
 */
export function formatShortWalletAddress(
  address: string,
  options?: FormatShortWalletAddressOptions,
): string {
  if (!isWalletAddress(address)) {
    return address;
  }

  const head = options?.head ?? 6;
  const tail = options?.tail ?? 4;
  return `${address.slice(0, head)}...${address.slice(-tail)}`;
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
