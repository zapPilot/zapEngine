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
      'A rule-based, regime-aware strategy that allocates across BTC, ETH, and stables — executed from your own wallet in one bundled transaction.',
  },

  // Hero section
  hero: {
    badge: '🛰️ Vision',
    title: {
      primary: 'The Non-Custodial BlackRock in Your Wallet',
      line1: 'The Non-Custodial',
      line2: 'BlackRock in Your Wallet',
    },
    subtitle:
      'Stop letting emotions ruin your investments. Zap Pilot brings BlackRock-grade asset allocation to your wallet — fully automated, always self-custodial.',
    ctaPrimary: 'Connect Telegram Bot (Coming Soon)',
    ctaSecondary: 'Protocol Integrations',
  },

  // Regime Visualizer section (second screen)
  regimeVisualizer: {
    title: 'Market Regimes & Logic',
    subtitle:
      'Using the 200-Day Moving Average (200MA), Fear & Greed Index (FGI), and ETH/BTC relative strength to identify market conditions and rebalance systematically.',
    interactionHint: '👆 Explore each regime to see how we respond',
    errorMessage: 'Unable to load regime visualizer',
    errorRetry: 'Please refresh the page or try again later.',
    loadingMessage: 'Loading regime visualizer...',
  },

  // Features section
  features: {
    title: 'Why Zap Pilot?',
    subtitle:
      'A smarter way to manage your crypto — powered by macroeconomic indicators and self-custodial smart accounts.',
    learnMore: 'Learn more',
    items: [
      {
        title: 'Macro Indicators',
        description:
          'Price vs the 200-Day Moving Average (200MA) plus the Fear & Greed Index (FGI) — two simple, objective signals decide whether the regime is risk-on, risk-off, or in-between.',
      },
      {
        title: 'Regime-Driven Strategy',
        description:
          'Rule-based allocation across BTC, ETH, and stables. Risk-on when price is above DMA-200 and sentiment is not frothy; defensive when below DMA-200 or in extreme greed. No discretion, no overrides.',
      },
      {
        title: 'ETH/BTC Rotation Overlay',
        description:
          'On top of the risk-on/off gate, we watch ETH/BTC relative strength vs its own 200-DMA. When ETH outperforms, we tilt the risk bucket toward ETH; when BTC leads, we rotate back. A 30-day cooldown after each cross prevents whipsaw.',
      },
      {
        title: 'Intent-Based Smart Accounts',
        description:
          'Each rebalance is one bundled intent. Executes as an EIP-7702 batch on supported wallets, or a multicall3 transaction as a fallback. No custody, no approvals spread across days.',
      },
      {
        title: 'One-Click Rebalancing',
        description:
          'You get the new target allocation (BTC / ETH / stable) pre-packaged as a single batch transaction. One signature inside your own wallet — done.',
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
          'Constantly tracking 200MA and FGI to detect shifts in the market regime.',
        color: 'from-purple-500 to-violet-600',
      },
      {
        number: 2,
        icon: 'Bell' as const,
        title: 'Signal',
        description:
          'When the regime shifts, you get a Telegram message with the new target allocation (BTC / ETH / stable) and a pre-built transfer bundle ready to sign.',
        color: 'from-blue-500 to-cyan-600',
      },
      {
        number: 3,
        icon: 'Zap' as const,
        title: 'Execute',
        description:
          'Sign one bundled transaction in your own wallet — EIP-7702 batch on supported wallets, multicall3 as a fallback. No custody hand-off.',
        color: 'from-green-500 to-emerald-600',
      },
    ],
  },

  // CTA section
  cta: {
    title: "The goal isn't to trade more;",
    titleSecondLine: "it's to trade right.",
    subtitle: 'Be your own BlackRock.',
    ctaPrimary: 'Connect Telegram Bot (Coming Soon)',
    ctaSecondary: 'Read the Strategy',
  },

  // Use Cases section
  useCases: {
    title: 'Use Cases',
    subtitle: 'Real scenarios where Zap Pilot keeps you disciplined.',
    bottomMessage: {
      line1: 'Let the 200MA, FGI, and ETH/BTC ratio guide your allocation.',
      line2:
        'Zap Pilot bundles the rebalance — you sign once, inside your own wallet.',
    },
  },

  // Footer section
  footer: {
    brand: {
      description:
        'Regime-driven BTC/ETH/stable allocation, executed from your own wallet in one bundled transaction.',
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
      suffix: 'for DeFi',
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
    sentimentDriven: 'Driven by Fear & Greed',
    manualSigning: 'You sign every transaction',
    oneClickExecution: 'One bundled, one signature',
    notAFund: 'Not a fund. You are in control.',
  },

  // Protocols section
  protocols: {
    title: 'Integrated Protocols',
    subtitle:
      'Where your stablecoins earn yield while you wait for the next move.',
    items: [
      {
        name: 'Morpho',
        category: 'Lending',
        description: 'Earn yield on stablecoins via curated lending vaults.',
        logo: '/protocols/morpho.webp',
        link: 'https://morpho.org',
      },
      {
        name: 'GMX v2',
        category: 'LP Vaults',
        description: 'On-chain perpetual liquidity backing BTC/ETH trades.',
        logo: '/protocols/gmx-v2.webp',
        link: 'https://gmx.io',
      },
      {
        name: 'Hyperliquid',
        category: 'Delta-Neutral',
        description: 'Leading perp DEX market making for stable yields.',
        logo: '/protocols/hyperliquid.webp',
        link: 'https://hyperfoundation.org/',
      },
    ],
  },
} as const;
