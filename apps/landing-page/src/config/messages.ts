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
      'A rules-based, regime-aware allocator across S&P500 (Ondo), BTC/ETH, and stables — executed from your own EOA wallet in one bundled transaction. ~90% of the return comes from the strategy itself, not from yield.',
  },

  // Hero section
  hero: {
    badge: '🛰️ Disciplined Portfolio Autopilot',
    title: {
      primary: 'The Non-Custodial BlackRock in Your Wallet',
      line1: 'The Non-Custodial',
      line2: 'BlackRock in Your Wallet',
    },
    subtitle:
      'Three pillars — S&P500, BTC/ETH, stablecoins — rebalanced by regime, not by emotion. Sell when markets are greedy, buy when they are fearful. 100% self-custody: we deliver the bundle, you sign it.',
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
    title: 'Backtested Across Cycles',
    subtitle:
      'The strategy was tested across {{TBD: window, e.g. 2017–2025}} including the 2018 bear, 2020 COVID crash, 2022 drawdown, and 2024 rally.',
    stats: [
      {
        label: 'CAGR',
        value: '{{TBD: e.g. 24.3%}}',
        sublabel: 'vs HODL: {{TBD}}',
      },
      {
        label: 'Max Drawdown',
        value: '{{TBD: e.g. -18.5%}}',
        sublabel: 'vs HODL: {{TBD}}',
      },
      {
        label: 'Sharpe Ratio',
        value: '{{TBD: e.g. 1.42}}',
        sublabel: 'risk-adjusted return',
      },
      {
        label: 'Vs Buy-&-Hold',
        value: '{{TBD: e.g. +12.1%}}',
        sublabel: '{{TBD: window}}',
      },
    ],
    disclaimer:
      'Past performance does not guarantee future results. Backtest details and methodology in the docs.',
    ctaText: 'Read methodology',
    ctaLink: '/docs#backtest',
  },

  // CTA section
  cta: {
    title: "The goal isn't to trade more;",
    titleSecondLine: "it's to trade right.",
    subtitle:
      'Be your own BlackRock — three pillars, one wallet, zero emotion.',
    ctaPrimary: 'Connect Telegram Bot (Coming Soon)',
    ctaSecondary: 'Read the Strategy',
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
    title: 'Where Idle Capital Sits',
    subtitle:
      '~90% of returns come from the strategy itself — regime-based rebalancing across S&P500, BTC/ETH, and stables. While waiting for the next signal, idle capital earns baseline yield in best-in-class venues. We are not a yield aggregator; yield is the icing.',
    items: [
      {
        name: 'Ondo',
        category: 'Tokenized S&P500',
        description:
          "On-chain exposure to U.S. equities via Ondo's tokenized S&P500 — the equity pillar of the portfolio.",
        logo: '/protocols/ondo.webp',
        link: 'https://ondo.finance',
      },
      {
        name: 'GMX v2',
        category: 'BTC/ETH Parking',
        description:
          'Where idle BTC/ETH earns baseline yield via GLP/GMX vaults while the regime stays risk-on.',
        logo: '/protocols/gmx-v2.webp',
        link: 'https://gmx.io',
      },
      {
        name: 'Morpho',
        category: 'Stablecoin Parking',
        description:
          'Curated lending vaults where idle stablecoins earn baseline yield during risk-off regimes.',
        logo: '/protocols/morpho.webp',
        link: 'https://morpho.org',
      },
      {
        name: 'Hyperliquid',
        category: 'Stablecoin Parking',
        description:
          'HLP delta-neutral market making — an alternative idle-stable parking venue for diversification.',
        logo: '/protocols/hyperliquid.webp',
        link: 'https://hyperfoundation.org/',
      },
    ],
  },
} as const;
