import { describe, expect, it } from 'vitest';

import {
  APP_TAB_NAMES,
  DEFAULT_APP_TAB,
  DEFAULT_APP_TAB_PATH,
  isTabAccessible,
} from '@/integration/navigationModel';

describe('app tab navigation', () => {
  it('uses Podcast as the default tab and post-login destination', () => {
    expect(DEFAULT_APP_TAB).toBe('podcast');
    expect(DEFAULT_APP_TAB_PATH).toBe('/podcast');
  });

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
    expect(APP_TAB_NAMES.filter((tab) => !isTabAccessible(tab, false))).toEqual([
      'strategy',
      'activity',
      'account',
    ]);
  });

  it('lets connected users open every tab', () => {
    expect(APP_TAB_NAMES.filter((tab) => isTabAccessible(tab, true))).toEqual(
      APP_TAB_NAMES,
    );
  });
});
