import { formatApprovedWalletList } from '@zapengine/app-core/lib/wallet/approvedWallets';

import { CONNECTING_LABEL } from '@/components/connect/connectGateCopy';

export const CONNECT_SHEET_COPY = {
  eyebrow: 'CONNECT',
  title: 'Choose how to connect',
  subtitle:
    'Sign in with email, or link a self-custody wallet. Zap Pilot never holds your funds.',
  privyTitle: 'Continue with email or social',
  privySubtitle: 'Email · Google · Apple — no wallet needed',
  divider: 'OR CONNECT A WALLET',
  recommendedLabel: 'RECOMMENDED',
  browserExtensionSubtitle: 'Browser extension',
  emptyTitle: 'No browser wallet detected',
  emptyBody: `Install ${formatApprovedWalletList()}, or continue with Privy.`,
  footer: 'Self-custody. You approve every transaction.',
  connectingSubtitle: CONNECTING_LABEL,
  closeLabel: 'Close connect options',
} as const;

export const CONNECT_WALLET_CTA = 'Connect wallet';
