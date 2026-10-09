import { LINKS } from './links';
import { BRAND_NAME, SLOGAN, oneLiner } from '@zapengine/zap-pilot-story/brand';
import type {
  CapabilityRef,
  CapabilityStatus,
} from '@zapengine/zap-pilot-story/facts';

/*
 * /pitch copy. Like MESSAGES, it never states liveness in prose: anything
 * that claims a capability references a `CAPABILITIES` id, and the slide
 * renders that capability's status badge. Typed status parameters make a
 * status change in the story facts fail type-check here until the copy is revised.
 */

interface StatusPart<S extends CapabilityStatus = CapabilityStatus> {
  readonly text: string;
  readonly capability: CapabilityRef<S>;
  readonly qualifier?: string;
}

export const PITCH_CTAS = {
  bookCall: LINKS.support.contactUs,
  emailFounder: LINKS.support.contactUs,
  waitlist: '/#waitlist',
} as const;

export const PITCH_META = {
  title: `${BRAND_NAME} — Investor Pitch`,
  description: `${SLOGAN} ${oneLiner()} A reference strategy you can read, wallet-signed deposits into positions you hold, and checks before every signature.`,
  url: 'https://zap-pilot.org/pitch',
} as const;

export const PITCH_OG = {
  label: 'INVESTOR PITCH',
  url: 'zap-pilot.org/pitch',
  footer: 'OPEN SOURCE · NO ZAP PILOT VAULT',
} as const;

export const PITCH_SLIDES = [
  { id: 'cover', label: 'Cover' },
  { id: 'problem', label: 'Problem' },
  { id: 'solution', label: 'Solution' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'proof', label: 'Proof' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'why-now', label: 'Why now' },
  { id: 'ask', label: 'Ask' },
] as const;

export type PitchSlideId = (typeof PITCH_SLIDES)[number]['id'];

export const PITCH_PROBLEM = {
  kicker: 'The problem',
  headline:
    'Self-custody secures the keys. The portfolio process still belongs to someone else.',
  bullets: [
    'Do it by hand, and every rebalance is a manual, emotional call.',
    'Hand it over, and you deposit into a product’s vault and accept its house strategy.',
    'Either way, the rules aren’t yours to read, test, or replace.',
  ],
} as const;

export const PITCH_SOLUTION = {
  kicker: 'Solution',
  headline: 'Own the strategy, the machine, and the wallet.',
} as const;

export const PITCH_RUNTIME = {
  kicker: 'The runtime',
  headline: 'One loop. Every stage labeled with what runs today.',
  stages: [
    {
      label: 'Strategy',
      parts: [
        {
          text: 'DMA/FGI Portfolio Rules, the reference strategy',
          capability: 'reference-strategy',
        },
      ],
    },
    {
      label: 'Target',
      parts: [
        {
          text: 'A target allocation and the rule that fired',
          capability: 'reference-strategy',
          qualifier: 'advisory',
        },
      ],
    },
    {
      label: 'Current portfolio',
      parts: [
        {
          text: 'Positions at your address, refreshed daily',
          capability: 'portfolio-tracking',
        },
      ],
    },
    {
      label: 'Rebalance plan',
      parts: [
        {
          text: 'The gap between target and positions, as transactions',
          capability: 'rebalance-plans',
        },
      ],
    },
    {
      label: 'Policy validation',
      parts: [
        { text: 'Built-in checks', capability: 'pre-sign-checks' },
        { text: 'Your policy', capability: 'policy-engine' },
      ],
    },
    {
      label: 'Execution',
      parts: [
        { text: 'Deposits you sign', capability: 'deposit-plans' },
        { text: 'Unattended', capability: 'unattended-runs' },
      ],
    },
    {
      label: 'Verification',
      parts: [
        {
          text: 'Unsigned daily snapshots',
          capability: 'snapshot-chain',
        },
        { text: 'One rule on-chain', capability: 'verifiable-rule' },
      ],
    },
  ],
  footer: {
    text: 'Deterministic first. AI, if added, stays optional and bounded by your policy.',
    capability: 'ai-exception-layer',
  },
} as const satisfies {
  kicker: string;
  headline: string;
  stages: readonly {
    label: string;
    parts: readonly StatusPart[];
  }[];
  footer: StatusPart<'planned'>;
};

export const PITCH_STRATEGY = {
  kicker: 'Reference strategy',
  headline: 'DMA/FGI Portfolio Rules: signals, not emotion.',
  body: 'A deterministic priority stack reads 200-day moving averages, crypto and US-equity Fear & Greed, and ETH/BTC relative strength. The first rule that fires sets the day’s advisory target — no scoring, no blending, no overrides.',
  tableHead: { signal: 'Signal', job: 'Job', outcome: 'Outcome' },
  table: [
    { signal: '200-DMA', job: 'Trend filter', outcome: 'Risk-on or defend' },
    {
      signal: 'Fear & Greed',
      job: 'Sentiment filter',
      outcome: 'Buy weakness, defend froth',
    },
    {
      signal: 'ETH / BTC',
      job: 'Crypto rotation',
      outcome: 'ETH tilt or BTC tilt',
    },
  ],
  sleeves: {
    text: 'Target spans S&P 500, BTC/ETH and stablecoins; the S&P 500 sleeve has no adapter yet.',
    capability: 'tokenized-equities',
  },
  footerLink: {
    href: '/docs/track-record/dma-fgi-portfolio-rules-v1#rules-in-priority-order',
    label: 'See the six rules in priority order',
  },
} as const satisfies {
  sleeves: StatusPart<'planned'>;
  [key: string]: unknown;
};

export const PITCH_WALLET = {
  kicker: 'Wallet',
  headline: 'Today: deposits you sign. Next: rebalances you sign.',
  flowToday: {
    label: 'Today',
    capability: 'deposit-plans',
    steps: [
      'Choose amount and mix',
      'Plan built',
      'Checked & simulated',
      'You sign',
      'Settles at your address',
    ],
    signStepIndex: 3,
  },
  flowPlanned: {
    label: 'Next',
    steps: [
      { text: 'Strategy target', capability: 'reference-strategy' },
      { text: 'Planner', capability: 'rebalance-plans' },
      { text: 'Your policy', capability: 'policy-engine' },
      {
        text: 'You sign; later, scoped permissions',
        capability: 'unattended-runs',
      },
      { text: 'Verified & recorded', capability: 'snapshot-chain' },
    ],
  },
} as const satisfies {
  kicker: string;
  headline: string;
  flowToday: {
    label: string;
    capability: CapabilityRef<'live'>;
    steps: readonly string[];
    signStepIndex: number;
  };
  flowPlanned: { label: string; steps: readonly StatusPart[] };
};

export const PITCH_ROADMAP = {
  kicker: 'Roadmap',
  headline: 'What runs, what’s next, what’s later.',
  now: { label: 'Now' },
  next: {
    label: 'Next',
    items: [
      {
        text: 'Strategy interface + backtesting your own rules',
        capability: 'strategy-lab',
      },
      { text: 'Rebalance planner', capability: 'rebalance-plans' },
      { text: 'Policy engine', capability: 'policy-engine' },
      { text: 'Local runtime', capability: 'self-hosting' },
      {
        text: 'Adapter hardening, including tokenized S&P 500',
        capability: 'tokenized-equities',
      },
    ],
  },
  later: {
    label: 'Later',
    items: [
      {
        text: 'Deterministic unattended rebalancing within scoped permissions',
        capability: 'unattended-runs',
      },
      {
        text: 'Strategy publishing, versioning, pinning and verifiable track records',
        capability: ['strategy-publishing', 'strategy-versioning'],
      },
      { text: 'Optional AI exception layer', capability: 'ai-exception-layer' },
    ],
  },
  footer: 'Sequence, not dates.',
} as const satisfies {
  kicker: string;
  headline: string;
  now: { label: string };
  next: { label: string; items: readonly StatusPart<'planned'>[] };
  later: { label: string; items: readonly StatusPart<'planned'>[] };
  footer: string;
};

export const PITCH_WHY_NOW = {
  kicker: 'Why now',
  headline: 'The wallet became programmable.',
  items: [
    {
      era: 'Shift · 01',
      label: 'Wallets can batch',
      body: 'EIP-5792 and EIP-7702 let one signature approve an all-or-nothing batch of calls.',
    },
    {
      era: 'Shift · 02',
      label: 'Exposure lives at your address',
      body: 'Lending, liquidity and market-making positions can be held by your own address, with no intermediary account in between.',
    },
    {
      era: 'Shift · 03',
      label: 'Rules can be checked, not trusted',
      body: 'Open code, daily public backtests, and one rule recomputed on testnet.',
      capability: 'verifiable-rule',
    },
  ],
} as const;

export const PITCH_ASK = {
  headline:
    'Help us make the portfolio process as self-custodied as the assets.',
  ctas: [
    { label: 'Book an intro call', href: PITCH_CTAS.bookCall, primary: true },
    { label: 'Email founder', href: PITCH_CTAS.emailFounder },
    {
      label: 'Join the waitlist',
      href: PITCH_CTAS.waitlist,
    },
  ],
} as const;
