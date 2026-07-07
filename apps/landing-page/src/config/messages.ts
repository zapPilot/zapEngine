import {
  formatMetricPercent,
  formatPercentagePoint,
  getBacktestSnapshot,
} from '@/data/snapshot';

const BACKTEST_SNAPSHOT = getBacktestSnapshot();
const DCA_CLASSIC_BASELINE = {
  roiPercent: -14.36,
  maxDrawdownPercent: -43.02,
  calmarRatio: -0.25,
  sharpeRatio: -0.17,
  tradeCount: 500,
} as const;
const ROI_VS_DCA_PP = formatPercentagePoint(
  BACKTEST_SNAPSHOT.raw.roiPercent - DCA_CLASSIC_BASELINE.roiPercent,
);

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

  regimeStrip: {
    ariaLabel: 'Regime data',
    header: 'Telemetry feeding the next bundle',
    liveStatus: 'live · mainnet',
    pendingStatus: 'awaiting live telemetry',
  },

  // Product tour section — mirrors the app's Home / Portfolio / Invest screens
  productTour: {
    kicker: 'Product tour',
    title: 'The autopilot you actually get.',
    subtitle:
      'The hero is not a mockup — net worth, balance trend, and allocation are the first screen of the app. Here is the rest of it.',
    frames: [
      {
        name: 'Home',
        kicker: 'Net worth',
        headline: 'Every pillar in one number.',
        description:
          'Net worth, balance trend, and self-custodied assets — with Invest and Send one tap away. Demo mode shows the same screen before you connect a wallet.',
      },
      {
        name: 'Portfolio',
        kicker: 'Strategy position',
        headline: 'Metrics & allocation breakdown.',
        description:
          'Your strategy position, performance metrics, and the live three-pillar allocation — the same bar the engine rebalances.',
      },
      {
        name: 'Invest',
        kicker: 'Invest wizard',
        headline: 'Amount → route → confirm → sign.',
        description:
          'A guided flow builds the plan; the last step is always your signature from your own wallet. EIP-7702 bundles where supported.',
      },
    ],
  },

  // Backtest proof section
  backtest: {
    title: 'Trades drove the return.',
    subtitle: `${BACKTEST_SNAPSHOT.windowDays}-day strategy snapshot pinned to ${BACKTEST_SNAPSHOT.referenceDate}. ${BACKTEST_SNAPSHOT.displayName} vs DCA Classic, daily signal evaluation, ${BACKTEST_SNAPSHOT.tradeCount} executed trades.`,
    stats: [
      {
        label: 'ROI vs DCA',
        value: ROI_VS_DCA_PP,
        sublabel: `${BACKTEST_SNAPSHOT.roiPercent} strategy vs ${formatMetricPercent(
          DCA_CLASSIC_BASELINE.roiPercent,
        )} DCA`,
      },
      {
        label: 'Strategy ROI',
        value: BACKTEST_SNAPSHOT.roiPercent,
        sublabel: `${BACKTEST_SNAPSHOT.windowDays}-day window`,
      },
      {
        label: 'Calmar Ratio',
        value: BACKTEST_SNAPSHOT.calmarRatio,
        sublabel: `vs DCA: ${DCA_CLASSIC_BASELINE.calmarRatio}`,
      },
      {
        label: 'Sharpe Ratio',
        value: BACKTEST_SNAPSHOT.sharpeRatio,
        sublabel: `vs DCA: ${DCA_CLASSIC_BASELINE.sharpeRatio}`,
      },
      {
        label: 'Max Drawdown',
        value: BACKTEST_SNAPSHOT.maxDrawdownPercent,
        sublabel: `vs DCA: ${formatMetricPercent(
          DCA_CLASSIC_BASELINE.maxDrawdownPercent,
        )}`,
      },
    ],
    comparison: [
      {
        label: 'Strategy',
        roi: BACKTEST_SNAPSHOT.roiPercent,
        maxDrawdown: BACKTEST_SNAPSHOT.maxDrawdownPercent,
        trades: BACKTEST_SNAPSHOT.tradeCount,
      },
      {
        label: 'DCA Classic',
        roi: formatMetricPercent(DCA_CLASSIC_BASELINE.roiPercent),
        maxDrawdown: formatMetricPercent(
          DCA_CLASSIC_BASELINE.maxDrawdownPercent,
        ),
        trades: String(DCA_CLASSIC_BASELINE.tradeCount),
      },
    ],
    disclaimer: `Past performance does not guarantee future results. Backtest window: ${BACKTEST_SNAPSHOT.windowStart} to ${BACKTEST_SNAPSHOT.windowEnd}, reference date pinned to ${BACKTEST_SNAPSHOT.referenceDate}.`,
    ctaText: 'Read methodology',
    ctaLink: '/docs#backtest',
  },

  // CTA section
  cta: {
    title: "The goal isn't to trade more;",
    titleSecondLine: "it's to trade right.",
    subtitle:
      'A rules engine watches the regime, builds the rebalance, and hands your account a single signature. Custody never leaves your wallet.',
    ctaPrimary: 'Open the app',
    ctaSecondary: 'Read the Strategy',
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

  // Protocols section
  protocols: {
    title: 'Yield is the onboarding step, not the positioning',
    subtitle:
      'Yield is the icing — not the strategy. Zap Pilot is positioned around disciplined allocation; parking venues are where idle exposure can earn baseline yield while the rules wait for the next trade.',
    items: [
      {
        name: 'Ondo',
        category: 'Tokenized S&P500',
        description:
          "On-chain exposure to U.S. equities via Ondo's tokenized S&P500 — the equity pillar the engine trades into when risk is rewarded.",
        logo: '/protocols/ondo.webp',
        accent: '#d4c5a3',
        glow: 'rgba(212, 197, 163, 0.14)',
        link: 'https://ondo.finance',
      },
      {
        name: 'GMX v2',
        category: 'BTC/ETH Parking',
        description:
          'Where idle BTC/ETH can earn baseline yield while the regime stays risk-on between rebalance signals.',
        logo: '/protocols/gmx-v2.webp',
        accent: '#7c6df2',
        glow: 'rgba(124, 109, 242, 0.14)',
        link: 'https://gmx.io',
      },
      {
        name: 'Morpho',
        category: 'Stablecoin Parking',
        description:
          'Curated lending vaults where defensive stablecoins can park during risk-off regimes.',
        logo: '/protocols/morpho.webp',
        accent: '#2775ca',
        glow: 'rgba(39, 117, 202, 0.14)',
        link: 'https://morpho.org',
      },
      {
        name: 'Hyperliquid',
        category: 'Stablecoin Parking',
        description:
          'HLP delta-neutral market making — an alternative defensive parking venue between strategy trades.',
        logo: '/protocols/hyperliquid.webp',
        accent: '#20b8a6',
        glow: 'rgba(32, 184, 166, 0.14)',
        link: 'https://hyperfoundation.org/',
      },
    ],
  },

  // FAQ section
  faq: {
    title: 'Before you connect a wallet.',
    subtitle:
      'The strategy is designed to stay self-custodial, explicit, and reviewable. These are the practical questions that should be answered before anyone signs.',
    items: [
      {
        question: 'What do I see inside the app?',
        answer:
          "An investment autopilot account: your net worth, balance trend, three-pillar allocation, self-custodied assets, and the full activity log. The engine's telemetry — regime, signals, next rebalance — is visible, not hidden.",
      },
      {
        question: 'Is there a demo mode?',
        answer:
          'Yes. The app opens in Demo mode with the same Home, Portfolio, and Invest screens populated by sample data. Connect a wallet to switch to Live.',
      },
      {
        question: 'Is the app on web and mobile?',
        answer:
          'One codebase ships to web and mobile. The same account — net worth, portfolio, and activity — follows you across devices.',
      },
      {
        question: 'How is Zap Pilot truly non-custodial?',
        answer:
          'Your funds stay in your own externally owned account. Zap Pilot prepares a rebalance bundle; you review it and sign from your wallet. We never hold private keys, custody assets, or move funds without your signature.',
      },
      {
        question: 'What happens if I miss a rebalance window?',
        answer:
          'Nothing moves automatically. The engine keeps watching the regime and can deliver the next eligible bundle, but your current allocation may drift until you choose to sign.',
      },
      {
        question: 'What are the fees?',
        answer:
          'Network gas and protocol-level fees are paid from your wallet and previewed before signing. Zap Pilot fee terms will be disclosed before launch; the backtest does not assume a hidden custody or management fee.',
      },
      {
        question: 'Which chain does this run on?',
        answer:
          'Zap Pilot is built for EVM mainnet execution with wallet-signed plans. EIP-7702 atomic batching is used where supported, with sequential approval and execution transactions as the fallback path.',
      },
      {
        question: 'What if Ondo, Morpho, GMX, or Hyperliquid has an issue?',
        answer:
          'Parking venues are modular, not custody requirements. If a venue is unavailable or unattractive, the bundle can route defensively instead. You still review the destination and protocol risk before signing.',
      },
      {
        question: 'Can I customize my allocations?',
        answer:
          'The initial launch focuses on curated, published strategy rules so behavior is easy to verify. Saved configuration controls can come later without changing the self-custody execution model.',
      },
      {
        question: 'How are gas costs handled with the bundled transaction?',
        answer:
          'The bundle compresses the rebalance into one wallet action where possible. Your wallet previews gas before signing, and you can skip execution if conditions are not worth it.',
      },
      {
        question: 'Is the strategy open-source or verifiable?',
        answer:
          'The methodology, parameters, and on-chain transactions are designed to be inspectable. Strategy docs and source links are published so the rules can be reviewed instead of trusted blindly.',
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
