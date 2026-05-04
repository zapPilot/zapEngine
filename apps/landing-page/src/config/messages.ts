export const MESSAGES = {
  // Common / Brand info
  common: {
    brandName: 'Zap Pilot',
    logoAlt: 'Zap Pilot Logo',
  },

  // Navbar section
  navbar: {
    launchApp: 'Launch App',
  },

  // Error messages
  errors: {
    generic: {
      title: 'Something went wrong',
      description:
        'We encountered an unexpected error. Please try refreshing the page.',
      refreshButton: 'Refresh Page',
    },
  },

  // Philosophy
  slogans: {
    philosophy: 'Buy in fear. Defend in greed.',
    philosophyDescription:
      'A rules-based, regime-aware allocator across S&P500 (Ondo), BTC/ETH, and stables — executed from your own EOA wallet in one bundled transaction. ~90% of the return comes from buying weakness and defending in greed, not from yield.',
  },

  // Hero section
  hero: {
    badge: 'Disciplined Portfolio Autopilot',
    title: {
      primary: 'Trade with discipline. Yield is the icing.',
      line1: 'Trade with discipline.',
      line2: 'Yield is the icing.',
    },
    subtitle:
      'A rules engine that earns from trades, not yield. ~90% of the return comes from buying weakness and defending in greed across S&P500, BTC/ETH, and stables. We deliver the bundle; you sign it from your own wallet.',
    ctaPrimary: 'Connect Telegram Bot (Coming Soon)',
    ctaSecondary: 'See the Backtest',
  },

  // Regime Visualizer section (second screen)
  regimeVisualizer: {
    title: 'Regime Signals, Not Emotion',
    subtitle:
      'Using the 200-Day Moving Average (200MA), Fear & Greed Index (FGI), and ETH/BTC relative strength to decide when the three-pillar portfolio should buy risk, defend in cash, or rotate inside crypto.',
    interactionHint: '👆 Explore each regime to see how we respond',
    errorMessage: 'Unable to load regime visualizer',
    errorRetry: 'Please refresh the page or try again later.',
    loadingMessage: 'Loading regime visualizer...',
  },

  // V2 live telemetry strip
  regimeTelemetry: {
    status: 'live · mainnet',
    regime: 'greed' as const,
    items: [
      {
        label: 'Regime',
        value: 'Greed',
        detail: 'Risk-on legs active',
      },
      {
        label: 'FGI',
        value: '72',
        detail: 'Greed zone',
      },
      {
        label: '200MA Δ',
        value: '+14.2%',
        detail: 'Above trend',
      },
      {
        label: 'Next rebal',
        value: '02:14:00',
        detail: 'Queued check',
      },
    ],
  },

  // Features section
  features: {
    title: 'Why Zap Pilot?',
    subtitle:
      'A disciplined portfolio autopilot across S&P500, BTC/ETH, and cash — powered by macro regime signals and your own wallet.',
    learnMore: 'Learn more',
    items: [
      {
        title: 'The Three Pillars',
        description:
          "S&P500 via Ondo's tokenized index, BTC/ETH for crypto risk-on, and stablecoins for defense. Three assets, one disciplined allocator. No tokens you can't pronounce, no protocols you don't understand.",
      },
      {
        title: 'Macro Regime Engine',
        description:
          'Two objective signals — price vs the 200-Day Moving Average and the Fear & Greed Index — decide risk-on, risk-off, or in-between. ETH/BTC relative strength adds a 30-day-cooldown rotation overlay on top. No discretion, no overrides.',
      },
      {
        title: 'Strategy First, Yield Second',
        description:
          '~90% of returns come from regime trading itself — buying weakness, selling froth. While idle, your capital earns baseline yield (Ondo for S&P500, GMX for BTC/ETH, Morpho/Hyperliquid for stables) — but yield is the icing, not the strategy.',
      },
      {
        title: '100% Self-Custody EOA',
        description:
          'Your funds live in your own externally-owned account. We never custody, never approve, never hold keys. Each rebalance is a pre-packaged bundle delivered to you — you review, you sign, you move on.',
      },
      {
        title: 'One-Click Bundled Rebalance',
        description:
          'EIP-7702 batch on supported wallets, multicall3 as fallback. Every regime shift becomes a single transaction across the three pillars — one signature, fully self-custodial, fully transparent.',
      },
    ],
  },

  // How It Works section
  howItWorks: {
    title: 'Execution Engine',
    subtitle: 'How Zap Pilot operates seamlessly in the background.',
    steps: [
      {
        number: 1,
        icon: 'LineChart' as const,
        title: 'Monitor',
        description:
          'We watch 200MA, FGI, and ETH/BTC relative strength 24/7 — looking for regime shifts across S&P500, crypto, and cash.',
        color: 'from-purple-500 to-violet-600',
      },
      {
        number: 2,
        icon: 'Bell' as const,
        title: 'Signal',
        description:
          'When the regime moves, you get a Telegram message with the new target allocation across all three pillars and a pre-built bundle ready to sign.',
        color: 'from-blue-500 to-cyan-600',
      },
      {
        number: 3,
        icon: 'Zap' as const,
        title: 'Execute',
        description:
          'Sign one bundled transaction in your own wallet — EIP-7702 batch on supported wallets, multicall3 as fallback. Idle capital quietly earns baseline yield until the next signal.',
        color: 'from-green-500 to-emerald-600',
      },
    ],
  },

  // Backtest proof section
  backtest: {
    title: 'Trades drove the return.',
    subtitle:
      '500-day strategy snapshot pinned to 2026-04-15. Minimum hierarchical production candidate vs DCA Classic, daily signal evaluation, 85 executed trades.',
    stats: [
      {
        label: 'ROI vs DCA',
        value: '+135.8pp',
        sublabel: '121.44% strategy vs -14.36% DCA',
      },
      {
        label: 'Strategy ROI',
        value: '121.44%',
        sublabel: '500-day window',
      },
      {
        label: 'Calmar Ratio',
        value: '4.50',
        sublabel: 'vs DCA: -0.25',
      },
      {
        label: 'Sharpe Ratio',
        value: '1.91',
        sublabel: 'vs DCA: -0.17',
      },
      {
        label: 'Max Drawdown',
        value: '-17.46%',
        sublabel: 'vs DCA: -43.02%',
      },
    ],
    comparison: [
      {
        label: 'Strategy',
        roi: '121.44%',
        maxDrawdown: '-17.46%',
        trades: '85',
      },
      {
        label: 'DCA Classic',
        roi: '-14.36%',
        maxDrawdown: '-43.02%',
        trades: '500',
      },
    ],
    disclaimer:
      'Past performance does not guarantee future results. Backtest window: 2024-12-02 to 2026-04-15, reference date pinned to 2026-04-15.',
    ctaText: 'Read methodology',
    ctaLink: '/docs#backtest',
  },

  // CTA section
  cta: {
    title: "The goal isn't to trade more;",
    titleSecondLine: "it's to trade right.",
    subtitle:
      'A rules engine watches the regime, builds the rebalance, and leaves custody with you. Yield waits in the background.',
    ctaPrimary: 'Connect Telegram Bot (Coming Soon)',
    ctaSecondary: 'Read the Strategy',
  },

  // V2 How It Works section
  howItWorksV2: {
    title: 'Three steps. One signature.',
    subtitle:
      'The engine turns regime data into a concrete allocation change, then hands execution back to your wallet.',
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
          'Regime moves trigger a target allocation across S&P500, BTC/ETH, and stables. The engine trades into the pillar the rules call for.',
      },
      {
        title: 'Sign',
        meta: 'EIP-7702 · multicall3',
        description:
          'Telegram delivers a pre-built bundle. EIP-7702 batch on supported wallets, multicall3 fallback. One signature, your keys.',
      },
    ],
  },

  // V2 feature attribution section
  whyItWorks: {
    title: 'What happens if we remove a feature?',
    subtitle:
      'Two leave-one-out ablations from the 500-day snapshot explain why this is a trading strategy first.',
    source:
      'Source: leave-one-out backtests, 500-day window, snapshot fixture pinned 2026-04-15.',
    items: [
      {
        feature: 'DMA stable gating',
        impact: '-96.96pp ROI',
        description:
          'Stops buying when crypto crosses below the 200-day moving average. It prevents the DCA-into-a-falling-knife failure mode.',
      },
      {
        feature: 'Greed Sell Suppression',
        impact: '-22.05pp ROI',
        description:
          'Holds through extreme-greed peaks instead of forcing early de-risking. It removes the emotional sell bias.',
      },
    ],
  },

  // Use Cases section
  useCases: {
    title: 'Use Cases',
    subtitle: 'Real scenarios where Zap Pilot keeps you disciplined.',
    bottomMessage: {
      line1:
        'Let the 200MA, FGI, and ETH/BTC ratio guide your three-pillar allocation.',
      line2:
        'Zap Pilot bundles the rebalance — you sign once, inside your own wallet.',
    },
  },

  // Footer section
  footer: {
    brand: {
      description:
        'A regime-driven 3-pillar allocator (S&P500 · BTC/ETH · Stables), executed from your own wallet in one bundled transaction. 100% self-custody.',
    },
    sections: {
      product: 'Product',
      resources: 'Resources',
    },
    newsletter: {
      title: 'Stay Updated',
      description: 'Get the latest features and insights.',
      buttonText: 'Subscribe',
      disclaimer: 'No spam, unsubscribe anytime.',
    },
    copyright: '© {year} Zap Pilot. All rights reserved.',
    builtWith: {
      prefix: 'Built with',
      suffix: 'for disciplined self-custody',
    },
  },

  // Allocation visualizer
  allocation: {
    categories: {
      spot: 'Spot',
      stable: 'Stable',
      lp: 'LP',
    },
    strategies: {
      lending: 'Lending',
      perps: 'Perps',
    },
    transition: {
      show: 'Show Transition',
      hide: 'Hide Transition',
    },
    timeframe: 'One bundled transaction',
    maintaining: {
      message: 'Maintaining current allocation',
      subtitle: 'Zero rebalancing — Holiday Mode',
    },
  },

  // Core value propositions (reusable)
  values: {
    selfCustody: 'Your keys, your crypto, always',
    sentimentDriven: 'Driven by macro regime, not emotion',
    manualSigning: 'You sign every transaction',
    oneClickExecution: 'One bundled, one signature',
    notAFund: 'Not a fund. You are in control.',
  },

  // Protocols section
  protocols: {
    title: 'Where idle capital parks between trades',
    subtitle:
      'Yield is the icing — not the strategy. Between regime signals, idle S&P500, BTC/ETH, and stablecoin exposure can earn baseline yield in best-in-class venues while the rules wait for the next trade.',
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
          'Zap Pilot is built for EVM mainnet execution with wallet-signed bundles. EIP-7702 batching is used where supported, with multicall3 as the fallback path.',
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
