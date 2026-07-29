import {
  approvedWalletRank,
  formatApprovedWalletList,
  isApprovedWalletConnector,
} from '@zapengine/app-core/lib/wallet/approvedWallets';
import type { WalletConnectorOption } from '@zapengine/app-core/types';

/**
 * Applies the product allowlist to discovered connectors. Generic
 * WalletConnect remains configured below the UI layer for future curated
 * deep-links, but it must never expose an unrestricted wallet directory.
 */
export function approvedWalletOptions(
  connectors: readonly WalletConnectorOption[],
): WalletConnectorOption[] {
  return connectors
    .filter(
      (option) =>
        option.type === 'injected' && isApprovedWalletConnector(option),
    )
    .sort((a, b) => approvedWalletRank(a) - approvedWalletRank(b));
}

export interface ConnectErrorCopy {
  title: string;
  body: string;
}

const USER_REJECTED_PATTERN = /reject|denied|4001/i;
const NO_PROVIDER_PATTERN = /provider not found|no wallet|not installed/i;

/**
 * Maps a `WalletProviderInterface.error` into picker-friendly copy. The sheet
 * stays open on error so the user can retry a different option.
 */
export function mapConnectError(
  error: { message: string; code?: string } | null,
): ConnectErrorCopy | null {
  if (!error) {
    return null;
  }

  if (error.code === 'WALLET_SELECTION_REQUIRED') {
    return {
      title: 'Choose a wallet',
      body: 'Multiple wallets were detected — pick one below.',
    };
  }

  if (error.code === 'NO_WALLET' || NO_PROVIDER_PATTERN.test(error.message)) {
    return {
      title: "Couldn't reach that wallet",
      body: `Make sure ${formatApprovedWalletList()} is installed and unlocked.`,
    };
  }

  if (USER_REJECTED_PATTERN.test(error.message)) {
    return {
      title: 'Request cancelled',
      body: 'You dismissed the wallet prompt — try again.',
    };
  }

  return {
    title: 'Connection failed',
    body: error.message,
  };
}
