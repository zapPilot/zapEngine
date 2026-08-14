import {
  backtestDisclaimer,
  backtestSubtitle,
  buildBacktestStats,
  buildComparisonRows,
} from '@/data/backtest-stats';

export const MESSAGES = {
  // Common / Brand info
  common: {
    brandName: 'Zap Pilot',
  },

  // Philosophy
  slogans: {
    philosophy: 'Buy in fear. Defend in greed.',
    philosophyDescription:
      'A self-custodial investment autopilot across S&P500 (Ondo), BTC/ETH, and stables — regime-aware rebalancing executed from your own EOA wallet with atomic batching where supported. The core return story is buying weakness and defending in greed, not chasing yield.',
  },

  // Hero section
  hero: {
    badge: 'Disciplined autopilot',
    title: {
      primary: 'Your net worth, on autopilot.',
    },
    subtitle:
      'A self-custodial investment autopilot across S&P500, BTC/ETH, and stables. Watch your net worth, allocation, and every rebalance — signed from your wallet, held by no one else.',
    ctaPrimary: 'Open the app',
    ctaSecondary: 'See the Backtest',
  },

  // Backtest proof section
  backtest: {
    title: 'Trades drove the return.',
    subtitle: backtestSubtitle(),
    stats: buildBacktestStats(),
    comparison: buildComparisonRows(),
    disclaimer: backtestDisclaimer(),
    ctaText: 'Read methodology',
    ctaLink: '/docs#backtest',
  },

  // How It Works section
  howItWorks: {
    title: 'Your self-custodial autopilot.',
    subtitle:
      'Three steps between market data and your portfolio — the last one is always your signature, never our discretion.',
    steps: [
      {
        title: 'Sense',
        meta: '200MA · FGI · ETH/BTC',
        description:
          'The 200-day moving average, Fear & Greed Index, and ETH/BTC ratio are watched continuously. Two macro signals, no discretion.',
      },
      {
        title: 'Decide',
        meta: 'Buy fear · defend greed',
        description:
          'Regime moves become a new target allocation for your account across S&P500, BTC/ETH, and stables. The engine trades into the pillar the rules call for.',
      },
      {
        title: 'Sign',
        meta: 'In-app · EIP-7702',
        description:
          'The app presents the rebalance as one pre-built plan. Review it and sign from your own wallet — atomic wallets sign one EIP-7702 bundle; others approve and execute sequentially. Your keys stay in control.',
      },
    ],
  },

  // Trust strip section
  trustBadges: [
    {
      label: '100% Self-Custody · EOA',
      icon: 'KeyRound',
    },
    {
      label: 'Live on Mainnet',
      icon: 'Activity',
    },
    {
      label: 'Open-source strategy',
      icon: 'GitBranch',
      linkType: 'github',
    },
  ],
} as const;
