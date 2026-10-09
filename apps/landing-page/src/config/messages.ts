import { LINKS } from './links';
import type {
  CapabilityRef,
  CapabilityStatus,
} from '@zapengine/zap-pilot-story/facts';
import {
  backtestDisclaimer,
  backtestHeadline,
  backtestSubtitle,
  buildBacktestStats,
  buildComparisonRows,
  referenceTradeSummary,
  type BacktestComparisonRow,
  type BacktestStat,
} from '@/data/backtest-stats';
import { engineDecision } from '@zapengine/zap-pilot-story/facts';

/*
 * Home-page, waitlist and shared pitch copy. Copy never states whether
 * something runs today: an item that makes a capability claim references a
 * `CAPABILITIES` id from the story facts and the page renders its status badge.
 * `src/config/__tests__/positioning.test.tsx` fences every string here.
 */

type TodayStatus = Exclude<CapabilityStatus, 'planned'>;

interface Link {
  readonly label: string;
  readonly href: string;
}

/** Copy that carries a status badge for the capability it describes. */
interface StatusLine<S extends CapabilityStatus = CapabilityStatus> {
  readonly text: string;
  readonly capability: CapabilityRef<S>;
  readonly qualifier?: string;
}

/** Copy that carries a status badge only when it makes a capability claim. */
interface Note<S extends CapabilityStatus = CapabilityStatus> {
  readonly text: string;
  readonly capability?: CapabilityRef<S>;
}

interface TraceRow extends StatusLine {
  readonly stage: string;
  readonly href?: string;
  readonly note?: StatusLine;
}

interface OwnershipCard {
  readonly title: string;
  readonly promise: string;
  readonly today: readonly Note<TodayStatus>[];
  readonly next: StatusLine<'planned'>;
}

interface RuntimeStep extends StatusLine {
  readonly title: string;
  readonly notes?: readonly Note[];
}

interface StrategyCard extends StatusLine {
  readonly title: string;
  readonly tag: string;
  readonly meta?: string;
  readonly notes?: readonly StatusLine[];
  readonly link: Link;
}

export type AdapterKey =
  | 'morpho'
  | 'gmx-v2'
  | 'hyperliquid'
  | 'lifi'
  | 'tokenized-sp500';

interface AdapterCard extends StatusLine {
  readonly key: AdapterKey;
  readonly name: string;
  readonly tag: string;
}

interface Guarantee extends StatusLine {
  readonly title: string;
}

interface TrustBadge {
  readonly label: string;
  readonly icon: 'KeyRound' | 'Activity' | 'GitBranch';
  readonly linkType?: 'github';
  readonly capability?: CapabilityRef;
}

interface MessagesContract {
  readonly common: {
    readonly brandName: string;
    readonly tagline: string;
    readonly brandLine: string;
    readonly brandLineParts: readonly string[];
  };
  readonly meta: {
    readonly title: string;
    readonly description: string;
    readonly keywords: string;
    readonly imageAlt: string;
  };
  readonly nav: {
    readonly ariaLabel: string;
    readonly links: readonly Link[];
    readonly cta: string;
  };
  readonly download: {
    readonly mac: string;
    readonly macRequirement: string;
    readonly appStore: string;
    readonly appStoreNote: string;
    readonly googlePlay: string;
    readonly all: string;
    readonly waitlist: string;
  };
  readonly hero: {
    readonly eyebrow: string;
    readonly subtitle: string;
    readonly chips: readonly StatusLine[];
    readonly actionsLabel: string;
    readonly secondaryCta: Link;
  };
  readonly trace: {
    readonly ariaLabel: string;
    readonly title: string;
    readonly replay: string;
    readonly strategy: string;
    readonly rows: readonly TraceRow[];
    readonly footnote: string;
  };
  readonly ownership: {
    readonly kicker: string;
    readonly title: string;
    readonly todayLabel: string;
    readonly nextLabel: string;
    readonly cards: readonly OwnershipCard[];
  };
  readonly runtime: {
    readonly kicker: string;
    readonly title: string;
    readonly lede: string;
    readonly steps: readonly RuntimeStep[];
    readonly footnote: {
      readonly lead: string;
      readonly items: readonly StatusLine<'planned'>[];
    };
  };
  readonly strategies: {
    readonly kicker: string;
    readonly title: string;
    readonly lede: string;
    readonly cards: readonly StrategyCard[];
  };
  readonly backtest: {
    readonly kicker: string;
    readonly title: string;
    readonly subtitle: string;
    readonly stats: readonly BacktestStat[];
    readonly comparison: readonly BacktestComparisonRow[];
    readonly disclaimer: string;
    readonly sleeveNote: StatusLine<'planned'>;
    readonly table: {
      readonly strategy: string;
      readonly roi: string;
      readonly maxDrawdown: string;
      readonly trades: string;
    };
    readonly methodLink: Link;
    readonly verifyLink: Link & StatusLine<'research'>;
    readonly chart: {
      readonly kicker: string;
      readonly title: string;
      readonly caption: string;
      readonly comparisonLabel: string;
    };
  };
  readonly adapters: {
    readonly kicker: string;
    readonly title: string;
    readonly lede: string;
    readonly note: string;
    readonly cards: readonly AdapterCard[];
  };
  readonly trust: {
    readonly kicker: string;
    readonly title: string;
    readonly lede: string;
    readonly guarantees: readonly Guarantee[];
    readonly mock: {
      readonly ariaLabel: string;
      readonly title: string;
      readonly tag: string;
      readonly rows: readonly {
        readonly label: string;
        readonly value: string;
      }[];
      readonly action: string;
      readonly footnote: string;
    };
  };
  readonly closing: {
    readonly quote: string;
    readonly lines: readonly StatusLine[];
    readonly primaryCta: string;
    readonly secondaryCta: string;
  };
  readonly ctaExperiment: {
    readonly cta: string;
    readonly body: string;
  };
  readonly waitlist: {
    readonly title: string;
    readonly close: string;
    readonly body: string;
    readonly emailLabel: string;
    readonly emailPlaceholder: string;
    readonly honeypotLabel: string;
    readonly submit: string;
    readonly submitting: string;
    readonly note: string;
    readonly error: string;
    readonly successTitle: string;
    readonly successBody: string;
    readonly community: string;
    readonly discordCta: string;
  };
  readonly footer: {
    readonly socialLabel: string;
    readonly github: string;
    readonly x: string;
    readonly discord: string;
  };
  readonly trustBadges: readonly TrustBadge[];
}

const BRAND_LINE_PARTS = [
  'Your strategy.',
  'Your machine.',
  'Your wallet.',
] as const;
const BRAND_LINE = BRAND_LINE_PARTS.join(' ');
const TRACE = engineDecision();
const CALCULATOR_HREF = `/track-record/calculator/?date=${TRACE.date}`;
const REFERENCE_SPEC_HREF = '/docs/track-record/dma-fgi-portfolio-rules-v1';

export const MESSAGES = {
  common: {
    brandName: 'Zap Pilot',
    tagline: 'portfolio runtime',
    brandLine: BRAND_LINE,
    brandLineParts: BRAND_LINE_PARTS,
  },

  meta: {
    title: `Zap Pilot — ${BRAND_LINE}`,
    description:
      'Zap Pilot is building a runtime for programmable portfolios: a reference strategy you can read, deposits into positions at your own address, and checks before you sign.',
    keywords:
      'programmable portfolio, portfolio runtime, self-custody, rules-based allocation, reference strategy, strategy backtest, DCA benchmark, 200-day moving average, Fear and Greed Index, ETH/BTC ratio, EIP-7702, EIP-5792, Morpho, GMX v2, Hyperliquid HLP, LI.FI, open source',
    imageAlt: 'Zap Pilot logo',
  },

  nav: {
    ariaLabel: 'Primary',
    links: [
      { label: 'Runtime', href: '#runtime' },
      { label: 'Strategies', href: '#strategy' },
      { label: 'Backtest', href: '#proof' },
      { label: 'Track record', href: '/track-record' },
      { label: 'Wallet', href: '#trust' },
      { label: 'Docs', href: '/docs' },
    ],
    cta: 'Join waitlist',
  },

  download: {
    mac: 'Download for Mac',
    macRequirement: 'Apple Silicon (M1+)',
    appStore: 'Download on the App Store',
    appStoreNote: 'Podcast + read-only portfolio',
    googlePlay: 'Get it on Google Play',
    all: 'All available downloads',
    waitlist: 'Join waitlist',
  },

  // Desire: Protection.
  hero: {
    eyebrow: 'A runtime for programmable portfolios',
    subtitle:
      'Zap Pilot is building a runtime that turns rules you can read into transactions only your wallet can sign — with no Zap Pilot vault in between.',
    chips: [
      { text: 'Open-source reference strategy', capability: 'open-source' },
      {
        text: 'Positions at your own address',
        capability: 'no-zap-pilot-vault',
      },
      { text: 'Checked before you sign', capability: 'pre-sign-checks' },
      { text: 'Runs on your machine', capability: 'self-hosting' },
    ],
    actionsLabel: 'Primary actions',
    secondaryCta: { label: 'See what runs today', href: '#runtime' },
  },

  trace: {
    ariaLabel: 'Runtime trace of a recorded backtest decision',
    title: 'Runtime trace',
    replay: `Backtest replay · ${TRACE.date}`,
    strategy: 'DMA/FGI Portfolio Rules · reference strategy',
    rows: [
      {
        stage: 'Observe',
        text: TRACE.observation,
        capability: 'market-signals',
      },
      {
        stage: 'Evaluate',
        text: 'Rule 1 of 6 fired: cross-down exit',
        capability: 'reference-strategy',
      },
      {
        stage: 'Target',
        text: `→ ${TRACE.stablePercent}% stables · ${TRACE.spyPercent}% S&P 500 (advisory)`,
        capability: 'reference-strategy',
        note: {
          text: 'The S&P 500 sleeve has no adapter yet',
          capability: 'tokenized-equities',
        },
      },
      {
        stage: 'Plan',
        text: 'Turn the target into transactions',
        capability: 'rebalance-plans',
      },
      {
        stage: 'Check & sign',
        text: 'Simulate, cap approvals, you sign',
        capability: 'pre-sign-checks',
      },
      {
        stage: 'Verify',
        text: 'Recompute this exit on-chain',
        href: CALCULATOR_HREF,
        capability: 'verifiable-rule',
      },
    ],
    footnote:
      'Replay of a recorded backtest decision. Not a real account; nothing was signed.',
  },

  ownership: {
    kicker: 'Who owns what',
    title: "Every layer is yours to own. Here's how far each one is.",
    todayLabel: 'Today',
    nextLabel: 'Next',
    cards: [
      {
        title: 'Your strategy',
        promise: 'Rules you can read, test, and replace.',
        today: [
          {
            text: 'One reference strategy, DMA/FGI Portfolio Rules, is evaluated daily; each decision shows the rule that fired and the raw signals.',
            capability: 'reference-strategy',
          },
        ],
        next: {
          text: 'Write your own rules and backtest them against the same benchmark.',
          capability: 'strategy-lab',
        },
      },
      {
        title: 'Your machine',
        promise: 'The runtime runs on hardware you control.',
        today: [
          { text: 'Evaluation and planning run on Zap Pilot-hosted servers.' },
          {
            text: 'A Mac app that checks for drift every few hours and notifies you. It never signs.',
            capability: 'local-drift-check',
          },
        ],
        next: {
          text: 'Strategy evaluation and planning on your own machine.',
          capability: 'self-hosting',
        },
      },
      {
        title: 'Your wallet',
        promise: 'Assets stay at your address. You sign every batch.',
        today: [
          {
            text: 'Deposits go straight into Morpho, GMX and Hyperliquid positions you hold; no Zap Pilot vault; every batch is checked before you sign.',
            capability: 'deposit-plans',
          },
        ],
        next: {
          text: 'A policy you set — limits, allowlists, a kill switch — checked before anything is signed.',
          capability: 'policy-engine',
        },
      },
    ],
  },

  // Desire: Curiosity.
  runtime: {
    kicker: 'The runtime',
    title: 'Six steps from signal to signature. Not all of them run yet.',
    lede: 'Each step does one job and can be checked. Rules decide; your signature is the last step before money moves.',
    steps: [
      {
        title: 'Observe',
        text: 'Collect prices, sentiment and your current positions.',
        capability: 'market-signals',
        qualifier: 'hosted',
      },
      {
        title: 'Evaluate',
        text: 'Run the strategy: a target allocation and the rule that fired.',
        capability: 'reference-strategy',
      },
      {
        title: 'Plan',
        text: 'Turn the gap between target and positions into transactions.',
        capability: 'rebalance-plans',
        notes: [
          {
            text: 'Today: plans are built only for deposits you request.',
            capability: 'deposit-plans',
          },
        ],
      },
      {
        title: 'Check',
        text: 'Cap approvals, enforce minimum received, simulate the batch.',
        capability: 'pre-sign-checks',
        notes: [{ text: 'Your own policy rules', capability: 'policy-engine' }],
      },
      {
        title: 'Sign',
        text: 'One atomic batch where your wallet supports it, step by step otherwise.',
        capability: 'wallet-signing',
      },
      {
        title: 'Verify',
        text: 'Check the outcome and keep a public record.',
        capability: 'snapshot-chain',
        notes: [
          { text: 'Today: unsigned daily snapshots of one reference address.' },
          {
            text: 'One rule recomputable on-chain',
            capability: 'verifiable-rule',
          },
        ],
      },
    ],
    footnote: {
      lead: 'Deterministic first: no model decides your allocation.',
      items: [
        {
          text: 'An optional AI layer for exceptions, bounded by your policy, comes later.',
          capability: 'ai-exception-layer',
        },
        {
          text: 'Unattended execution waits for scoped on-chain permissions you can revoke.',
          capability: 'unattended-runs',
        },
      ],
    },
  },

  strategies: {
    kicker: 'Strategies',
    title: 'Strategy is the primitive. Start from a reference.',
    lede: 'A strategy turns signals into a target allocation and explains each decision. Today there is one reference strategy and one benchmark.',
    cards: [
      {
        title: 'DMA/FGI Portfolio Rules',
        tag: 'Reference strategy',
        text: 'Six rules in priority order; the first that fires sets the day’s target. Signals: 200-day moving averages, crypto and US-equity Fear & Greed, ETH/BTC. Cooldowns limit churn. Its philosophy: buy in fear, defend in greed.',
        meta: referenceTradeSummary(),
        capability: 'reference-strategy',
        notes: [
          {
            text: 'Its target includes an S&P 500 sleeve that can’t be executed yet.',
            capability: 'tokenized-equities',
          },
        ],
        link: { label: 'Read the spec', href: REFERENCE_SPEC_HREF },
      },
      {
        title: 'DCA Classic',
        tag: 'Benchmark',
        text: 'Starts half in BTC and moves the other half into BTC in equal daily amounts. Every reference-strategy backtest is measured against it.',
        capability: 'dca-benchmark',
        link: {
          label: 'Read the spec',
          href: '/docs/track-record/dca-classic-v1',
        },
      },
      {
        title: 'Cross-down exit, on-chain',
        tag: 'Verifiable rule',
        text: 'One of the six rules compiled to public Vyper bytecode on Arbitrum Sepolia with a pinned codehash. Recompute a recorded exit yourself.',
        capability: 'verifiable-rule',
        link: { label: 'Open the calculator', href: CALCULATOR_HREF },
      },
      {
        title: 'Bring your own rules',
        tag: 'Strategy lab',
        text: 'Write your own rules and backtest them against DCA Classic.',
        capability: 'strategy-lab',
        notes: [
          {
            text: 'Versioning, pinning and publishing come later.',
            capability: ['strategy-versioning', 'strategy-publishing'],
          },
        ],
        link: { label: 'Follow on GitHub', href: LINKS.social.github },
      },
    ],
  },

  backtest: {
    kicker: 'Backtest · reference strategy',
    title: backtestHeadline(),
    subtitle: backtestSubtitle(),
    stats: buildBacktestStats(),
    comparison: buildComparisonRows(),
    disclaimer: backtestDisclaimer(),
    sleeveNote: {
      text: 'The backtest’s S&P 500 sleeve has no executable adapter yet.',
      capability: 'tokenized-equities',
    },
    table: {
      strategy: 'Strategy',
      roi: 'ROI',
      maxDrawdown: 'Max drawdown',
      trades: 'Trades',
    },
    methodLink: {
      label: 'Read the backtest method',
      href: `${REFERENCE_SPEC_HREF}#backtest-method`,
    },
    verifyLink: {
      label: `Recompute the ${TRACE.date} exit on-chain`,
      href: CALCULATOR_HREF,
      text: '1 of 6 rules · testnet',
      capability: 'verifiable-rule',
    },
    chart: {
      kicker: 'Indexed growth',
      title: 'Reference strategy vs DCA Classic',
      caption:
        'Indexed to 100. Shaded band marks the observed max-drawdown range across the backtest window.',
      comparisonLabel: 'Reference strategy versus DCA',
    },
  },

  // Desire: Protection.
  adapters: {
    kicker: 'Adapters',
    title: 'Strategies speak allocation. Adapters speak protocols.',
    lede: 'A strategy decides weights. An adapter only encodes an action that’s already been decided — it never picks strategy. We add adapters when a strategy needs an exposure, not to lengthen a list.',
    note: 'Returns come from durable sources — lending demand, trading fees, market making — not incentive programs. All of them can lose money.',
    cards: [
      {
        key: 'morpho',
        name: 'Morpho',
        tag: 'Lending',
        text: 'Spark USDC vault on Base. Borrowers pay interest to the vault. Risks: curator, oracle and smart-contract risk.',
        capability: 'adapter-boundary',
      },
      {
        key: 'gmx-v2',
        name: 'GMX v2',
        tag: 'Liquidity provision',
        text: 'BTC/USD and ETH/USD GM pools on Arbitrum. Traders pay fees to the pool. You also carry their PnL and BTC/ETH price exposure.',
        capability: 'adapter-boundary',
      },
      {
        key: 'hyperliquid',
        name: 'Hyperliquid',
        tag: 'Market making',
        text: 'The HLP vault market-makes and takes on liquidations. Returns can be negative, and deposits are locked for a period set by Hyperliquid.',
        capability: 'adapter-boundary',
      },
      {
        key: 'lifi',
        name: 'LI.FI',
        tag: 'Routing',
        text: 'Swaps and bridges into those positions. Every route must meet a minimum received.',
        capability: 'adapter-boundary',
      },
      {
        key: 'tokenized-sp500',
        name: 'Tokenized S&P 500',
        tag: 'Equities',
        text: 'The reference strategy models an S&P 500 sleeve. No adapter can execute it yet, so deposits keep it at 0%.',
        capability: 'tokenized-equities',
      },
    ],
  },

  trust: {
    kicker: 'Wallet boundary',
    title: 'Assets stay at your address. Every batch waits for your signature.',
    lede: 'There’s no Zap Pilot vault or custody contract. A deposit is built as a plan, checked, and handed to your wallet, where it does nothing until you sign.',
    guarantees: [
      {
        title: 'No Zap Pilot vault.',
        text: 'Positions sit at your address inside the venues themselves, so you can also manage them there. Those venues are pooled third-party protocols with their own risks.',
        capability: 'no-zap-pilot-vault',
      },
      {
        title: 'Checked before you sign.',
        text: 'Approvals are capped, never unlimited; routed swaps must meet a minimum received; a batch that fails simulation can’t be signed.',
        capability: 'pre-sign-checks',
      },
      {
        title: 'One batch where your wallet supports it.',
        text: 'EIP-5792/7702 wallets sign one all-or-nothing batch; others approve and execute step by step.',
        capability: 'wallet-signing',
      },
      {
        title: 'Hyperliquid key stays on your device.',
        text: 'Hyperliquid deposits use an agent key created and stored on your device. You approve it once, and that approval may not expire.',
        capability: 'device-agent-key',
      },
      {
        title: 'Unattended only behind your limits.',
        text: 'Rebalancing without you will require on-chain scoped permissions: allowed targets, spend caps, expiry, and revocation you control.',
        capability: 'unattended-runs',
      },
    ],
    mock: {
      ariaLabel: 'Example deposit plan review',
      title: 'Deposit plan · review',
      tag: 'Example',
      rows: [
        { label: 'Funding', value: 'USDC · Base' },
        { label: 'Destination', value: 'Morpho USDC vault · Base' },
        { label: 'Approval', value: 'Capped to the deposit amount' },
        { label: 'Simulation', value: 'All checks passed' },
        {
          label: 'Transactions',
          value: 'Approve + deposit · one atomic batch',
        },
      ],
      action: 'Sign & Send',
      footnote: 'Illustrative review. Nothing moves until you sign.',
    },
  },

  // Desire: Belonging.
  closing: {
    quote: 'Self-custody shouldn’t stop at the keys.',
    lines: [
      {
        text: 'A reference strategy you can read, deposits into positions you hold, and checks before every signature.',
        capability: ['reference-strategy', 'deposit-plans', 'pre-sign-checks'],
      },
      {
        text: 'Your own strategies, your own policy, your own machine.',
        capability: ['strategy-lab', 'policy-engine', 'self-hosting'],
      },
    ],
    primaryCta: 'Join waitlist',
    secondaryCta: 'Join the Discord',
  },

  ctaExperiment: {
    cta: 'Get launch updates',
    body: 'Follow the programmable portfolio runtime as it develops. Leave your email for one launch update.',
  },

  waitlist: {
    title: 'Join the waitlist',
    close: 'Close waitlist',
    body: 'Zap Pilot is building a portfolio runtime you can run yourself. Leave your email for launch updates.',
    emailLabel: 'Email',
    emailPlaceholder: 'you@example.com',
    honeypotLabel: 'Company',
    submit: 'Join waitlist',
    submitting: 'Joining…',
    note: 'Launch updates only. No spam.',
    error: 'Could not join right now. Please try again.',
    successTitle: 'You’re on the list ✓',
    successBody: 'We’ll email you launch updates as the runtime ships.',
    community: 'Join our community for updates and conversation.',
    discordCta: 'Join the Discord →',
  },

  footer: {
    socialLabel: 'Social links',
    github: 'GitHub',
    x: 'X',
    discord: 'Discord community',
  },

  trustBadges: [
    { label: 'Self-custody · no Zap Pilot vault', icon: 'KeyRound' },
    {
      label: 'Deposits on mainnet',
      icon: 'Activity',
      capability: 'deposit-plans',
    },
    { label: 'Open source', icon: 'GitBranch', linkType: 'github' },
  ],
} as const satisfies MessagesContract;
