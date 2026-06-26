import { getStrategyTabLabel } from '@zapengine/app-core/regime';
import { describe, expect, it } from 'vitest';

describe('getStrategyTabLabel', () => {
  it('returns directional labels for transitional regimes', () => {
    expect(getStrategyTabLabel('f', 'fromLeft')).toBe('From Extreme Fear ↑');
    expect(getStrategyTabLabel('f', 'fromRight')).toBe('From Neutral ↓');
    expect(getStrategyTabLabel('g', 'fromLeft')).toBe('From Neutral ↑');
    expect(getStrategyTabLabel('g', 'fromRight')).toBe('From Peak ↓');
  });

  it('returns the default label for single-strategy regimes', () => {
    expect(getStrategyTabLabel('ef', 'default')).toBe('Market Bottom');
    expect(getStrategyTabLabel('n', 'default')).toBe('Holiday Mode');
    expect(getStrategyTabLabel('eg', 'default')).toBe('Market Peak');
  });

  it('returns undefined when the regime has no label for the direction', () => {
    expect(getStrategyTabLabel('ef', 'fromLeft')).toBeUndefined();
    expect(getStrategyTabLabel('n', 'fromRight')).toBeUndefined();
  });
});
