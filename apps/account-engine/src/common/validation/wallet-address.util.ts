const ETHEREUM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

/**
 * Performs a lightweight Ethereum address check shared across decorators and services.
 */
export function isWalletAddress(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  return ETHEREUM_ADDRESS_REGEX.test(value);
}
