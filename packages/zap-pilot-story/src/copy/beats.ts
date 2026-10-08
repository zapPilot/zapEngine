import {
  capabilityTotal,
  statusCount,
  engineDecision,
} from '../facts/index.js';
import type { CapabilityId } from '../facts/capabilities.js';
import { defendActivity } from './replay.js';
const decision = engineDecision();
export const HERO = {
  eyebrow: 'A runtime for programmable portfolios',
  lines: [
    ['Rules', 'decide.'],
    ['You', 'sign.|s'],
  ],
  body: 'Zap Pilot is building a runtime for programmable portfolios. Rules you can read become transactions only your wallet can sign — with no Zap Pilot vault in between.',
  note: 'On iPhone today: podcast + read-only portfolio',
};
export interface StageBeat {
  start: number;
  end: number;
  name: string;
  kick: string;
  lines: string[][];
  sub: string;
  capability: CapabilityId;
  badge?: CapabilityId;
}
export const STAGES: readonly StageBeat[] = [
  {
    start: 0,
    end: 0.11,
    name: 'Parts',
    kick: 'The runtime · three parts',
    lines: [
      ['Your', 'strategy.'],
      ['Your', 'machine.|o'],
      ['Your', 'wallet.|s'],
    ],
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
    badge: 'tokenized-equities',
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
    badge: 'rebalance-plans',
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
    lines: [
      ['Nothing', 'moves'],
      ['until', 'you', 'sign.|s'],
    ],
    sub: 'Your wallet signs the batch, with no Zap Pilot vault in between. Hyperliquid steps use a device key you approve once.',
    capability: 'wallet-signing',
  },
  {
    start: 0.89,
    end: 1.01,
    name: 'Status',
    kick: `Status · ${statusCount('live')} of ${capabilityTotal()} live`,
    lines: [
      ['Solid', 'runs', 'today.'],
      ['Wireframe|o', 'doesn’t', 'yet.'],
    ],
    sub: 'Running on your machine, your own policy and unattended runs are planned.',
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
    body: 'The reference strategy starts with BTC, an S&P 500 sleeve and stables.',
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
    rule: 'Rule 2',
    body: 'Only SPY is above its average, so all the risk goes there: a sleeve Zap Pilot can’t execute yet.',
  },
  {
    title: 'Back in',
    rule: 'Rule 2',
    body: 'BTC and ETH close back above their averages. An equal split again, trimmed into strength.',
  },
] as const;
