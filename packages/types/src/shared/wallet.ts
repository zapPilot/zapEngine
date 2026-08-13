/**
 * Wallet address validation and display utilities
 * Shared across account-engine, app-core, and alpha-etl
 */

export const WALLET_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export function isWalletAddress(value: unknown): value is `0x${string}` {
  return typeof value === 'string' && WALLET_ADDRESS_REGEX.test(value);
}

export interface ShortenAddressOptions {
  /** Characters kept from the start of the address (including `0x`). Default 6. */
  head?: number;
  /** Characters kept from the end of the address. Default 4. */
  tail?: number;
  /** Separator placed between the two halves. Default `...`. */
  ellipsis?: string;
}

/**
 * Shorten an address for display: `0x1234...abcd`.
 *
 * Returns the input untouched when it is already no longer than the two halves
 * combined. Callers own their own null/validity guards — this only slices.
 */
export function shortenAddress(
  address: string,
  { head = 6, tail = 4, ellipsis = '...' }: ShortenAddressOptions = {},
): string {
  if (address.length <= head + tail) {
    return address;
  }

  return `${address.slice(0, head)}${ellipsis}${address.slice(-tail)}`;
}
