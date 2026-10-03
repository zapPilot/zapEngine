import type { ShotSet } from '../../captures/types';
import { facts, shortHex } from './facts';

const ANSWER = 'aside.calc-answer';
const CALL = '.calc-call';
const BTC_PRICE = 'input[aria-label="BTC price on decision day"]';
const BTC_ROW = '.calc-asset[aria-label="BTC"]';
const ABOVE = `role=button[name="${facts.hold.scenario}"]`;
const SCENARIOS = { kind: 'viewport', scrollTo: '.calc-scenarios', offset: 48 } as const;

/**
 * What `pnpm capture calculator-pitch` photographs on the live calculator.
 * Every shot reloads the page, so steps never depend on an earlier shot.
 * "Call contract" is a read-only eth_call against the public RPC.
 */
export const shots = {
  path: '/track-record/calculator/',
  viewport: { width: 1440, height: 810 },
  deviceScaleFactor: 3,
  ready: 'text=Codehash matches',
  shots: {
    identity: {
      frame: { kind: 'viewport', scrollTo: '.calc-hero', offset: 72 },
      targets: {
        hero: '.calc-hero',
        identity: '.calc-identity',
        address: '.calc-identity > div:nth-child(2)',
        codehash: '.calc-identity > div:nth-child(3)',
        source: '.calc-identity > div:nth-child(4)',
        bytecodeCheck: '.calc-identity [role="status"]',
      },
      checks: [
        { selector: '.calc-identity', contains: facts.network },
        {
          selector: '.calc-identity',
          contains: shortHex(facts.address, 10, 6),
        },
        {
          selector: '.calc-identity',
          contains: shortHex(facts.runtimeCodehash, 10, 6),
        },
        { selector: '.calc-identity', contains: `Vyper ${facts.compiler}` },
        {
          selector: '.calc-identity',
          contains: `Sourcify (${facts.sourcify})`,
        },
        {
          selector: '.calc-identity [role="status"]',
          record: {
            name: 'checkedAtBlock',
            pattern: 'Codehash matches at block (\\d+)',
          },
        },
      ],
    },
    inputs: {
      frame: SCENARIOS,
      targets: {
        scenarios: '.calc-scenarios',
        real: '.calc-segments button[aria-pressed="true"]',
        above: ABOVE,
        market: '.calc-market',
        btcRow: BTC_ROW,
        btcPrice: BTC_PRICE,
        btcChart: `${BTC_ROW} .calc-chart`,
      },
      checks: [
        {
          selector: '.calc-segments button[aria-pressed="true"]',
          contains: `${facts.example.date} (real data)`,
          pressed: true,
        },
        { selector: BTC_PRICE, value: facts.example.btc.display },
      ],
    },
    cell: {
      steps: [{ focus: BTC_PRICE }],
      frame: SCENARIOS,
      targets: { btcRow: BTC_ROW, btcPrice: BTC_PRICE },
      checks: [{ selector: BTC_PRICE, value: facts.example.btc.price }],
    },
    ready: {
      frame: { kind: 'viewport', scrollTo: ANSWER, offset: 96 },
      targets: {
        answer: ANSWER,
        call: CALL,
        reference: '.calc-reference',
        market: '.calc-market',
      },
      checks: [
        { selector: ANSWER, contains: 'Ready to call.' },
        {
          selector: '.calc-reference',
          contains: `(${facts.example.movedPercent.toFixed(2)}% of the portfolio)`,
        },
      ],
    },
    receipt: {
      steps: [{ click: CALL }, { waitFor: '.calc-match' }],
      frame: { kind: 'element', selector: ANSWER, padding: 32 },
      targets: {
        answer: ANSWER,
        proof: '.calc-proof',
        verdict: '.calc-verdict',
        compare: '.calc-compare',
        outcomes: '.calc-outcomes',
        match: '.calc-match',
      },
      checks: [
        { selector: '.calc-proof', contains: 'Answer returned by the contract' },
        {
          selector: '.calc-proof',
          record: { name: 'calledAtBlock', pattern: 'Block (\\d+)' },
        },
        { selector: '.calc-verdict', contains: facts.example.verdict },
        { selector: '.calc-reason', contains: facts.example.reason },
        { selector: '.calc-compare', contains: '96.12%' },
        { selector: '.calc-match', contains: facts.example.match },
      ],
    },
    above: {
      steps: [{ click: ABOVE }],
      frame: SCENARIOS,
      targets: {
        scenarios: '.calc-scenarios',
        above: ABOVE,
        btcRow: BTC_ROW,
      },
      checks: [{ selector: ABOVE, pressed: true }],
    },
    hold: {
      steps: [
        { click: ABOVE },
        { click: CALL },
        { waitFor: `text=${facts.hold.verdict}` },
      ],
      frame: { kind: 'element', selector: ANSWER, padding: 32 },
      targets: {
        answer: ANSWER,
        proof: '.calc-proof',
        verdict: '.calc-verdict',
        outcomes: '.calc-outcomes',
      },
      checks: [
        { selector: '.calc-verdict', contains: facts.hold.verdict },
        {
          selector: '.calc-proof',
          contains: 'Answer returned by the contract',
        },
      ],
    },
    limits: {
      frame: { kind: 'element', selector: '.calc-limits', padding: 40 },
      targets: {
        proves: '.calc-limits > div:nth-child(1)',
        notProves: '.calc-limits > div:nth-child(2)',
      },
      checks: [
        { selector: '.calc-limits', contains: 'What this proves' },
        { selector: '.calc-limits', contains: 'production execution' },
      ],
    },
  },
} as const satisfies ShotSet;

export type ShotId = keyof typeof shots.shots;
