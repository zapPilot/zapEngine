import type { WalletConnectorOption } from '@zapengine/app-core/types';

export interface PartitionedWalletOptions {
  /** Approved EIP-7702 wallet brands, shown in product-priority order. */
  recommended: WalletConnectorOption[];
  /** Reserved for future curated connectors; unapproved wallets stay hidden. */
  other: WalletConnectorOption[];
  /** Whether an approved browser-extension wallet was detected. */
  hasInjected: boolean;
}

const APPROVED_WALLET_PRIORITY = ['rabby', 'ambire', 'okx'];
const APPROVED_RDNS = new Set(['io.rabby', 'com.ambire', 'com.okex.wallet']);

function isApprovedWallet(option: WalletConnectorOption): boolean {
  if (option.type !== 'injected') {
    return false;
  }
  const name = option.name.toLowerCase();
  return (
    APPROVED_RDNS.has(option.id) ||
    APPROVED_WALLET_PRIORITY.some((brand) => name.includes(brand))
  );
}

function recommendedPriority(option: WalletConnectorOption): number {
  const name = option.name.toLowerCase();
  const index = APPROVED_WALLET_PRIORITY.findIndex((needle) =>
    name.includes(needle),
  );
  return index === -1 ? APPROVED_WALLET_PRIORITY.length : index;
}

/**
 * Applies the product allowlist to discovered connectors. Generic
 * WalletConnect remains configured below the UI layer for future curated
 * deep-links, but it must never expose an unrestricted wallet directory.
 */
export function partitionWalletOptions(
  connectors: WalletConnectorOption[],
): PartitionedWalletOptions {
  const approved = connectors
    .filter(isApprovedWallet)
    .map((option) => ({ ...option, recommended: true }))
    .sort((a, b) => recommendedPriority(a) - recommendedPriority(b));

  return {
    recommended: approved,
    other: [],
    hasInjected: approved.length > 0,
  };
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
      body: 'Make sure Rabby, Ambire, or OKX Wallet is installed and unlocked.',
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
