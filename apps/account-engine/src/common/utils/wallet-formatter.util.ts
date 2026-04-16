import { isWalletAddress } from '@common/validation/wallet-address.util';

/**
 * Formats a wallet address to a shortened display format (0x1234...abcd)
 * @param address - The full wallet address to format
 * @returns Shortened wallet address or original string if invalid
 */
export function formatShortWalletAddress(address: string): string {
  if (!isWalletAddress(address)) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
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
