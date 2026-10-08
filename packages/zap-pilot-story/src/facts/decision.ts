import raw from './data/verifiable-strategy.json' with { type: 'json' };
import { ALLOCATION_ASSETS, ASSETS } from './assets.js';
import { ruleOf, type Rule } from './rules.js';

/**
 * The recorded cross-down exit the home page replays as a runtime trace.
 *
 * Every value comes from the committed verifiable-strategy export (a backtest
 * decision recomputed against the research contract), never from the page.
 */
const CROSS_DOWN_EXIT = 'portfolio_cross_down_exit';

interface RecordedExit {
  date: string;
  expected: { triggerMask: number; publishedTarget: string[] };
  publishedEvent: { reason: string };
  current: {
    symbol: string;
    price: { decimal: string };
    dma: { decimal: string };
  }[];
  previous: RecordedExit['current'];
  previousDate: string;
  allocation: { decimal: string }[];
}

function targetPercent(
  target: readonly string[],
  asset: (typeof ALLOCATION_ASSETS)[number],
): string {
  return (Number(target[ALLOCATION_ASSETS.indexOf(asset)]) * 100).toFixed(2);
}

export interface EngineDecision {
  date: string;
  previousDate: string;
  previousDmaDistance: Readonly<Record<string, number>>;
  /** Which assets crossed below their 200-day average that day. */
  observation: string;
  stablePercent: string;
  spyPercent: string;
  rule: Rule;
  dmaDistance: Readonly<Record<string, number>>;
  held: readonly number[];
  target: readonly number[];
}

function dmaDistances(
  records: RecordedExit['current'],
): Record<string, number> {
  return Object.fromEntries(
    records.map((asset) => [
      asset.symbol,
      Number(
        (
          (Number(asset.price.decimal) / Number(asset.dma.decimal) - 1) *
          100
        ).toFixed(2),
      ),
    ]),
  );
}

export function engineDecision(): EngineDecision {
  const example = (raw.examples as RecordedExit[]).find(
    (item) => item.publishedEvent.reason === CROSS_DOWN_EXIT,
  );
  if (example === undefined) {
    throw new Error('verifiable-strategy.json has no recorded cross-down exit');
  }
  const triggered = ASSETS.filter(
    (_, index) => (example.expected.triggerMask & (1 << index)) !== 0,
  );
  const target = example.expected.publishedTarget;
  return {
    date: example.date,
    previousDate: example.previousDate,
    previousDmaDistance: dmaDistances(example.previous),
    rule: ruleOf(example.publishedEvent.reason),
    dmaDistance: dmaDistances(example.current),
    held: example.allocation.map((value) =>
      Number((Number(value.decimal) * 100).toFixed(2)),
    ),
    target: target.map((value) => Number((Number(value) * 100).toFixed(2))),
    observation:
      triggered.length === 1
        ? `${triggered[0]} closed below its 200-day average`
        : `${triggered.join(' and ')} closed below their 200-day averages`,
    stablePercent: targetPercent(target, 'Stable'),
    spyPercent: targetPercent(target, 'SPY'),
  };
}
