import { ruleOf } from '../facts/rules.js';
import { chapters } from '../facts/chapters.js';
import { replay } from '../facts/replay.js';
export interface ReplayEvent {
  reason: string;
  amountPercent: number;
  fromAssets: readonly string[];
  toAsset: string | null;
}
const percentOf = (fraction: number): string =>
  `${Number((fraction * 100).toFixed(2))}%`;

/** The opening split, read from the pinned allocation trace rather than retyped. */
export function startSplitBody(): string {
  const [btc, , spy, stable] = replay.allocations.values[0]!;
  return `Start ${replay.snapshot.total_capital.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} split ${percentOf(btc!)} BTC, ${percentOf(spy!)} S&P 500, ${percentOf(stable!)} stables.`;
}

const assetName = (asset: string): string =>
  asset === 'SPY' ? 'S&P 500' : asset;
export function eventLabel(event: ReplayEvent): string {
  const rule = ruleOf(event.reason);
  const from = event.fromAssets.map(assetName).join(' + ');
  switch (rule) {
    case 1:
      return `Exit ${from} to stables, in full`;
    case 2:
      return 'Equal split across assets above their averages';
    case 3:
      return 'Rotate the crypto sleeve to ETH';
    case 4:
      return `Lean from ETH to BTC · ${event.amountPercent}%`;
    default:
      return `Trim ${from} · ${event.amountPercent}% to ${event.toAsset === null ? 'stables' : assetName(event.toAsset)}`;
  }
}
/** Count only the defended interval; rotations and equal splits are distinct beats. */
export function defendActivity(): { trims: number; leans: number } {
  const from = chapters.find((chapter) => chapter.id === 'defend')!.date;
  const to = chapters.find((chapter) => chapter.id === 'exit')!.date;
  const events = replay.events.filter(
    (event) => event.date >= from && event.date < to,
  );
  return {
    trims: events.filter((event) => [5, 6].includes(ruleOf(event.reason)))
      .length,
    leans: events.filter((event) => ruleOf(event.reason) === 4).length,
  };
}
