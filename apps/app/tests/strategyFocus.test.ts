import { describe, expect, it } from 'vitest';

import {
  parseStrategyFocusParam,
  STRATEGY_DECISION_FOCUS_HREF,
} from '@/integration/strategyFocus';

describe('strategy focus navigation', () => {
  it('parses the decision focus from scalar and array params', () => {
    expect(parseStrategyFocusParam('decision')).toBe('decision');
    expect(parseStrategyFocusParam(['decision'])).toBe('decision');
  });

  it.each([undefined, '', 'other', []])(
    'rejects an unsupported focus value: %j',
    (value) => {
      expect(parseStrategyFocusParam(value)).toBeNull();
    },
  );

  it('keeps the Home href and Strategy parser contract aligned', () => {
    const url = new URL(STRATEGY_DECISION_FOCUS_HREF, 'https://zap.test');

    expect(
      parseStrategyFocusParam(url.searchParams.get('focus') ?? undefined),
    ).toBe('decision');
  });
});
