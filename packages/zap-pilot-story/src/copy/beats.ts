import {
  oneLiner,
  PUNCHLINE,
  sloganLines,
  punchlineLines,
} from '../brand/index.js';
import {
  capabilityTotal,
  statusCount,
  engineDecision,
} from '../facts/index.js';
import type {
  CapabilityId,
  CapabilityRef,
  SharedCapabilityRef,
  CapabilityStatus,
} from '../facts/capabilities.js';
import { defendActivity, startSplitBody } from './replay.js';
const decision = engineDecision();
const planned = <T extends CapabilityRef<'planned'>>(ref: T): T => ref;
const HERO_CHIPS = [
  { text: 'Open-source reference strategy', capability: 'open-source' },
  { text: 'Positions at your own address', capability: 'no-zap-pilot-vault' },
  { text: 'Checked before you sign', capability: 'pre-sign-checks' },
  { text: 'Runs on your machine', capability: 'self-hosting' },
] as const satisfies readonly { text: string; capability: CapabilityRef }[];
export const HERO = {
  eyebrow: 'A runtime for programmable portfolios',
  lines: sloganLines(),
  body: `${oneLiner()} ${PUNCHLINE} Rules you can read become transactions only your wallet can sign — with no Zap Pilot vault in between.`,
  badge: 'self-hosting',
  chips: HERO_CHIPS,
  note: 'On iPhone today: podcast + read-only portfolio',
} as const;
export interface StageBeat {
  start: number;
  end: number;
  name: string;
  kick: string;
  lines: string[][];
  sub: string;
  capability: CapabilityId;
  badge?: SharedCapabilityRef;
  title?: string;
  tally?: CapabilityStatus;
}
export const STAGES: readonly StageBeat[] = [
  {
    start: 0,
    end: 0.11,
    name: 'Parts',
    kick: 'The runtime · three parts',
    lines: [],
    title: 'Three parts',
    sub: '',
    capability: 'reference-strategy',
  },
  {
    start: 0.11,
    end: 0.26,
    name: 'Observe',
    kick: '01 · Observe',
    lines: [
      ['It', 'reads', 'the'],
      ['market', 'every', 'day.'],
    ],
    sub: `On ${decision.date}, BTC closed ${Math.abs(decision.dmaDistance['BTC']!).toFixed(2)}% below its 200-day average. SPY and ETH stayed above theirs.`,
    capability: 'market-signals',
  },
  {
    start: 0.26,
    end: 0.41,
    name: 'Evaluate',
    kick: '02 · Evaluate',
    lines: [
      ['The', 'first', 'rule'],
      ['that', 'fires', 'wins.'],
    ],
    sub: 'Six rules, checked in order. Rule 1, the cross-down exit, fired. Rules 2 to 6 stood down.',
    capability: 'reference-strategy',
  },
  {
    start: 0.41,
    end: 0.53,
    name: 'Target',
    kick: '03 · Target',
    lines: [],
    sub: `BTC and ETH go to zero. The S&P 500 sleeve holds at ${decision.spyPercent}%.`,
    capability: 'reference-strategy',
    title: 'Target allocation',
    badge: planned('tokenized-equities'),
  },
  {
    start: 0.53,
    end: 0.61,
    name: 'Plan',
    kick: '04 · Plan',
    lines: [
      ['Rebalance', 'plans'],
      ['aren’t', 'built', 'yet.|o'],
    ],
    sub: 'Today, plans are built only for deposits you request.',
    capability: 'rebalance-plans',
    badge: planned('rebalance-plans'),
  },
  {
    start: 0.61,
    end: 0.76,
    name: 'Check',
    kick: '05 · Check',
    lines: [['Capped.'], ['Bounded.'], ['Simulated.']],
    sub: 'Capped approvals, a minimum received on every routed swap, and a simulation of every batch before it reaches your wallet.',
    capability: 'pre-sign-checks',
  },
  {
    start: 0.76,
    end: 0.89,
    name: 'Sign',
    kick: '06 · Sign',
    lines: punchlineLines(),
    sub: 'Nothing moves until you sign. Your wallet signs the batch, with no Zap Pilot vault in between. Hyperliquid steps use a device key you approve once.',
    capability: 'wallet-signing',
  },
  {
    start: 0.89,
    end: 1.01,
    name: 'Status',
    kick: 'Status',
    tally: 'live',
    lines: [
      ['Solid', 'runs', 'today.'],
      ['Wireframe|o', 'doesn’t', 'yet.'],
    ],
    sub: 'Running on your machine, your own policy and unattended runs are planned.',
    badge: planned(['self-hosting', 'policy-engine', 'unattended-runs']),
    capability: 'self-hosting',
  },
];
export const JOIN = {
  lines: [['Self-custody'], ['shouldn’t', 'stop'], ['at', 'the', 'keys.|s']],
  body: 'The rules are readable and the signature is yours. Next, the machine it runs on. Join the waitlist for launch updates.',
};
const activity = defendActivity();
export const CHAPTER_COPY = [
  {
    title: 'Start',
    rule: 'Starting split',
    body: startSplitBody(),
  },
  {
    title: 'Risk on',
    rule: 'Rule 2',
    body: 'BTC, ETH and SPY all close above their 200-day averages: an equal split, and stables go to zero.',
  },
  {
    title: 'Defend in greed',
    rule: 'Rules 3–6',
    body: `Rotate the crypto sleeve to ETH, then ${activity.trims} trims into strength and ${activity.leans} leans to BTC by mid-October.`,
  },
  {
    title: 'Exit',
    rule: 'Rule 1',
    body: 'The decision you just watched. Rule 1 exits the crypto sleeve into stables.',
  },
  {
    title: 'Into the S&P 500',
    capability: planned('tokenized-equities'),
    rule: 'Rule 2',
    body: 'Only SPY is above its average, so all the risk goes there: a sleeve Zap Pilot can’t execute yet.',
  },
  {
    title: 'Back in',
    rule: 'Rule 2',
    body: 'BTC and ETH close back above their averages. An equal split again, trimmed into strength.',
  },
] as const;

export const stageKick = (beat: StageBeat): string =>
  beat.tally
    ? `${beat.kick} · ${statusCount(beat.tally)} of ${capabilityTotal()} ${beat.tally}`
    : beat.kick;
