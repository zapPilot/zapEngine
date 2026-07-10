import type { WalletConnectorOption } from '@zapengine/app-core/types';

export interface PartitionedWalletOptions {
  /** Rabby/Ambire, vetted — shown first with a "Recommended" badge. */
  recommended: WalletConnectorOption[];
  /** Every other discovered wallet, plus the generic WalletConnect entry when configured. */
  other: WalletConnectorOption[];
  /** Whether any browser-extension wallet was detected (false is common on Electron). */
  hasInjected: boolean;
}

const RECOMMENDED_PRIORITY = ['rabby', 'ambire'];

function recommendedPriority(option: WalletConnectorOption): number {
  const name = option.name.toLowerCase();
  const index = RECOMMENDED_PRIORITY.findIndex((needle) =>
    name.includes(needle),
  );
  return index === -1 ? RECOMMENDED_PRIORITY.length : index;
}

/**
 * Splits the wallets `useWalletLogin().connectors` discovered into the
 * "Recommended" and "Other / not guaranteed" tiers the picker renders.
 * `useWagmiWalletBackend` already flags `recommended` (Rabby/Ambire) and only
 * includes the generic WalletConnect entry when a project ID is configured,
 * so this is a pure partition — no extra wallet-detection logic here.
 */
export function partitionWalletOptions(
  connectors: WalletConnectorOption[],
): PartitionedWalletOptions {
  return {
    recommended: connectors
      .filter((option) => option.recommended)
      .sort((a, b) => recommendedPriority(a) - recommendedPriority(b)),
    other: connectors.filter((option) => !option.recommended),
    hasInjected: connectors.some((option) => option.type === 'injected'),
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
      body: 'Make sure the extension is installed and unlocked, or use WalletConnect.',
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
