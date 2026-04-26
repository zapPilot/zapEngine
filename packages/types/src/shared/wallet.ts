/**
 * Wallet address validation utilities
 * Shared across account-engine, frontend, and alpha-etl
 */

export const WALLET_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export function isWalletAddress(value: unknown): value is string {
  return typeof value === 'string' && WALLET_ADDRESS_REGEX.test(value);
}
