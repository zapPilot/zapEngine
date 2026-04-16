export interface AddressFormatOptions {
  prefixLength?: number;
  suffixLength?: number;
  ellipsis?: string;
}

/**
 * Format a wallet address into a shortened display string.
 *
 * @param address - Address to shorten
 * @param options - Prefix/suffix formatting options
 * @returns Shortened address or empty string when the input is missing
 */
export function formatAddress(
  address?: string | null,
  {
    prefixLength = 6,
    suffixLength = 4,
    ellipsis = "...",
  }: AddressFormatOptions = {}
): string {
  if (!address || typeof address !== "string") {
    return "";
  }

  const normalized = address.trim();
  if (!normalized) {
    return "";
  }

  if (normalized.length <= prefixLength + suffixLength) {
    return normalized;
  }

  return `${normalized.slice(0, prefixLength)}${ellipsis}${normalized.slice(-suffixLength)}`;
}
