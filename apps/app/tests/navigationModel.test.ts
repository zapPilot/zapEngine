import { describe, expect, it } from 'vitest';

import { APP_TAB_NAMES, isTabAccessible } from '@/integration/navigationModel';

describe('app tab navigation', () => {
  it('keeps the original five-tab order with Podcast in the middle', () => {
    expect(APP_TAB_NAMES).toEqual([
      'home',
      'strategy',
      'podcast',
      'activity',
      'account',
    ]);
  });

  it('lets guests open only Home and Podcast', () => {
    expect(APP_TAB_NAMES.filter((tab) => isTabAccessible(tab, false))).toEqual([
      'home',
      'podcast',
    ]);
  });

  it('lets connected users open every tab', () => {
    expect(APP_TAB_NAMES.every((tab) => isTabAccessible(tab, true))).toBe(true);
  });
});
