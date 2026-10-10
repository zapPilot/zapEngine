import { BRAND_NAME, SLOGAN, oneLiner } from '@zapengine/zap-pilot-story/brand';
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

interface OwnershipCard {
  readonly title: string;
  readonly promise: string;
  readonly today: readonly Note<TodayStatus>[];
  readonly next: StatusLine<'planned'>;
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
  readonly meta: {
    readonly title: string;
    readonly description: string;
    readonly keywords: string;
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
  readonly ownership: {
    readonly kicker: string;
    readonly title: string;
    readonly todayLabel: string;
    readonly nextLabel: string;
    readonly cards: readonly OwnershipCard[];
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
const TRACE = engineDecision();
const CALCULATOR_HREF = `/track-record/calculator/?date=${TRACE.date}`;
const REFERENCE_SPEC_HREF = '/docs/track-record/dma-fgi-portfolio-rules-v2';

export const MESSAGES = {
  meta: {
    title: `${BRAND_NAME} — ${SLOGAN}`,
    description: `${oneLiner()} A reference strategy you can read, deposits into positions at your own address, and checks before you sign.`,
    keywords:
      'programmable portfolio, portfolio runtime, self-custody, rules-based allocation, reference strategy, strategy backtest, DCA benchmark, 200-day moving average, Fear and Greed Index, ETH/BTC ratio, EIP-7702, EIP-5792, Morpho, GMX v2, Hyperliquid HLP, LI.FI, open source',
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
      text: 'Version 1 exit rule · testnet',
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
  },

  ctaExperiment: {
    cta: 'Get launch updates',
    body: 'Follow the programmable portfolio runtime as it develops. Leave your email for one launch update.',
  },

  waitlist: {
    title: 'Join the waitlist',
    close: 'Close waitlist',
    body: `${oneLiner()} Leave your email for launch updates.`,
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
