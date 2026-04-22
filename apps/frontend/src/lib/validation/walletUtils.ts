/**
 * Wallet Utility Functions
 * Validation, transformation, and error handling for wallet operations
 */

import { APIError, handleHTTPError } from '@/lib/http';
import type { UserCryptoWallet } from '@/schemas/api/accountSchemas';

export interface WalletData {
  id: string;
  address: string;
  label: string;
  isMain: boolean;
  isActive: boolean;
  createdAt: string;
}

/**
 * Validate wallet address format
 */
export function validateWalletAddress(address: string): boolean {
  const ethRegex = /^0x[a-fA-F0-9]{40}$/;
  return ethRegex.test(address);
}

function toWalletData(wallet: UserCryptoWallet): WalletData {
  return {
    id: wallet.id,
    address: wallet.wallet,
    label: wallet.label || 'Wallet',
    isMain: false,
    isActive: false,
    createdAt: wallet.created_at,
  };
}

/**
 * Transform UserCryptoWallet to component-friendly format
 * Maintains compatibility with existing WalletManager component structure
 */
export function transformWalletData(wallets: UserCryptoWallet[]): WalletData[] {
  return wallets.map((wallet) => toWalletData(wallet));
}

function isWalletApiError(error: unknown): boolean {
  return (
    error instanceof APIError ||
    (error instanceof Error &&
      (error.name === 'APIError' || error.name === 'AccountServiceError'))
  );
}

/**
 * Error handling specific to wallet operations
 */
export function handleWalletError(error: unknown): string {
  if (isWalletApiError(error)) {
    return (error as Error).message;
  }

  return handleHTTPError(error);
}
