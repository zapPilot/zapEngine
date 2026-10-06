import raw from './verifiable-strategy.json';
import { ALLOCATION_ASSETS, ASSETS } from '@/lib/verifiable-strategy/encoding';

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
}

function targetPercent(
  target: readonly string[],
  asset: (typeof ALLOCATION_ASSETS)[number],
): string {
  return (Number(target[ALLOCATION_ASSETS.indexOf(asset)]) * 100).toFixed(2);
}

export interface RuntimeTrace {
  date: string;
  /** Which assets crossed below their 200-day average that day. */
  observation: string;
  stablePercent: string;
  spyPercent: string;
}

export function getRuntimeTrace(): RuntimeTrace {
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
    observation:
      triggered.length === 1
        ? `${triggered[0]} closed below its 200-day average`
        : `${triggered.join(' and ')} closed below their 200-day averages`,
    stablePercent: targetPercent(target, 'Stable'),
    spyPercent: targetPercent(target, 'SPY'),
  };
}
