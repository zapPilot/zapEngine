export const CONNECTING_LABEL = 'Connecting…';

export const CONNECT_SHEET_COPY = {
  eyebrow: 'CONNECT',
  title: 'Choose how to connect',
  subtitle:
    'Sign in with email, or link a self-custody wallet. Zap Pilot never holds your funds.',
  privyTitle: 'Continue with email or social',
  privySubtitle: 'Email · Google · Apple — no wallet needed',
  divider: 'OR CONNECT A WALLET',
  recommendedLabel: 'RECOMMENDED',
  otherLabel: 'OTHER WALLETS',
  otherCaption: 'availability not guaranteed',
  browserExtensionSubtitle: 'Browser extension',
  walletConnectName: 'WalletConnect',
  walletConnectSubtitle: 'Scan with a mobile wallet',
  emptyTitle: 'No browser wallet detected',
  emptyBody: 'Install Rabby, Ambire, or OKX Wallet, or continue with Privy.',
  footer: 'Self-custody. You approve every transaction.',
  connectingSubtitle: CONNECTING_LABEL,
  closeLabel: 'Close connect options',
} as const;

export const CONNECT_WALLET_CTA = 'Connect wallet';

export const CONNECT_GATE_COPY = {
  /** Pinned by tests/e2e/smoke.spec.ts (6 assertions) — do not reword. */
  signInTitle: 'Sign in to continue',
  webBody:
    'Connect with Privy or an approved EIP-7702 wallet to use your portfolio and investment tools.',
  webCta: 'Sign in',
  errorTitleWeb: 'Sign-in unavailable',
  errorTitleNative: 'Privy sign-in unavailable',
  errorBody:
    'Please try again. If the problem continues, contact Zap Pilot support.',
  demoTitle: "You're viewing sample data",
  demoBody:
    'Connect your wallet to see your real portfolio, balance trend and assets.',
} as const;
