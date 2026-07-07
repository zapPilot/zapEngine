import { LINKS } from './links';
import { MESSAGES } from './messages';

export const PITCH_CTAS = {
  bookCall: LINKS.support.contactUs,
  emailFounder: LINKS.support.contactUs,
  liveApp: LINKS.app,
} as const;

export const PITCH_META = {
  title: `${MESSAGES.common.brandName} — Investor Pitch`,
  description:
    'BlackRock in your wallet — then, precisely: the self-custodial robo-advisor for rules-based allocation across S&P 500, BTC/ETH, and stablecoins, with wallet-signed execution and no custody.',
  url: 'https://zap-pilot.org/pitch',
} as const;

export const PITCH_SLIDES = [
  { id: 'cover', label: 'Cover' },
  { id: 'problem', label: 'Problem' },
  { id: 'solution', label: 'Solution' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'pillars', label: 'Pillars' },
  { id: 'proof', label: 'Proof' },
  { id: 'execution', label: 'Execution' },
  { id: 'why-now', label: 'Why now' },
  { id: 'ask', label: 'Ask' },
] as const;

export type PitchSlideId = (typeof PITCH_SLIDES)[number]['id'];

export const PITCH_PROBLEM = {
  kicker: 'The behavior we replace',
  headline: "Self-directed investors trade. They don't rebalance.",
  bullets: [
    'They over-buy greed and under-buy fear.',
    'They chase yield while ignoring allocation.',
    'They custody funds with products built only for execution.',
  ],
} as const;

export const PITCH_STRATEGY = {
  kicker: 'Strategy',
  headline: 'Signals, not emotion.',
  body: 'A deterministic priority stack reads the 200-day moving average, Fear & Greed Index, and ETH/BTC relative strength. The first rule that fires sets the day’s allocation — no scoring, no blending, no overrides.',
  table: [
    { signal: '200MA', job: 'Trend filter', outcome: 'Risk-on or defend' },
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
  footerLink: {
    href: '/docs/how-it-works',
    label: 'See the full 6-rule breakdown',
  },
} as const;

export const PITCH_EXECUTION = {
  kicker: 'Execution',
  headline: 'One signature. No custody. No discretion.',
  bullets: [
    'EIP-7702 atomic batch on supporting wallets',
    'Sequential approve + execute fallback elsewhere',
    'One signature from your own externally-owned account',
    'No pooled funds, no discretionary manager, no custody',
  ],
  flow: [
    'Regime shift detected',
    'Bundle prepared',
    'Telegram delivers plan',
    'You sign',
    'On-chain settlement',
  ],
  signStepIndex: 3,
} as const;

export const PITCH_WHY_NOW = {
  kicker: 'Why now',
  headline: 'Three primitives just landed.',
  items: [
    {
      era: 'Primitive · 01',
      label: 'Tokenized equities',
      body: "Ondo's tokenized S&P 500 makes equity exposure a wallet-native asset for the first time.",
    },
    {
      era: 'Primitive · 02',
      label: 'EIP-7702',
      body: 'Atomic batched rebalances become a wallet capability, not a backend trick.',
    },
    {
      era: 'Primitive · 03',
      label: 'Intent routing',
      body: 'A single signature drives multi-leg execution across protocols and chains.',
    },
  ],
} as const;

export const PITCH_ASK = {
  headline:
    'Help us turn self-custody from a trading interface into a portfolio operating system.',
  ctas: [
    { label: 'Book an intro call', href: PITCH_CTAS.bookCall, primary: true },
    { label: 'Email founder', href: PITCH_CTAS.emailFounder },
    {
      label: 'See the live product',
      href: PITCH_CTAS.liveApp,
      external: true,
    },
  ],
} as const;
