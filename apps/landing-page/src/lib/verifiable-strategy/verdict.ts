import { ASSETS } from './encoding';
import type { ExitResult } from './types';

export function verdict(exit: ExitResult) {
  if (exit.cooled_off)
    return {
      title: `Hold. The exit rule is cooling down (${exit.remaining_days} days left).`,
      reason: 'The previous exit is still within the 30-day rule cooldown.',
    };
  if (!exit.matched)
    return {
      title: 'Hold. No asset crossed below its 200-day average.',
      reason:
        'The contract returned no executable cross-down exit for these inputs.',
    };
  if (exit.liquidated_mask === 0)
    return {
      title: 'Exit triggered, but nothing to sell.',
      reason: 'The rule matched, but no affected assets are held.',
    };
  const names = ASSETS.filter(
    (_, i) => (exit.liquidated_mask & (1 << i)) !== 0,
  ).join(' and ');
  return {
    title: `Move ${names} to stablecoins.`,
    reason:
      exit.trigger_mask & 2
        ? 'BTC crossed below its 200-day average. A BTC trigger also exits ETH.'
        : 'The contract returned an exit for the assets crossing below their 200-day average.',
  };
}
