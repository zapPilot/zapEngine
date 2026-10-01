import { describe, expect, it } from 'vitest';

import {
  activeAppTabForPathname,
  resolveLandingPath,
  APP_TAB_NAMES,
  DEFAULT_APP_TAB,
  DEFAULT_APP_TAB_PATH,
  isTabAccessible,
} from '@/integration/navigationModel';

describe('app tab navigation', () => {
  it('uses Podcast as the guest default tab', () => {
    expect(DEFAULT_APP_TAB).toBe('podcast');
    expect(DEFAULT_APP_TAB_PATH).toBe('/podcast');
  });

  it('keeps the four-tab order with Podcast in the middle', () => {
    expect(APP_TAB_NAMES).toEqual(['home', 'strategy', 'podcast', 'account']);
  });

  it('lets guests open Home and Podcast', () => {
    expect(APP_TAB_NAMES.filter((tab) => isTabAccessible(tab, false))).toEqual([
      'home',
      'podcast',
    ]);
    expect(APP_TAB_NAMES.filter((tab) => !isTabAccessible(tab, false))).toEqual(
      ['strategy', 'account'],
    );
  });

  it('lets connected users open every tab', () => {
    expect(APP_TAB_NAMES.filter((tab) => isTabAccessible(tab, true))).toEqual(
      APP_TAB_NAMES,
    );
  });
});

it('keeps stack destinations associated with the correct navigation item', () => {
  expect(
    ['/home', '/portfolio', '/send', '/invest', '/invest/route'].map(
      activeAppTabForPathname,
    ),
  ).toEqual(Array(5).fill('home'));
  expect(
    ['/podcast', '/podcast/id?lang=en', '/e', '/e/id'].map(
      activeAppTabForPathname,
    ),
  ).toEqual(Array(4).fill('podcast'));
  expect(['/account', '/wallets/'].map(activeAppTabForPathname)).toEqual([
    'account',
    'account',
  ]);
  expect(activeAppTabForPathname('/strategy')).toBe('strategy');
  expect(
    ['/', '/unknown', '/investment', '/podcast-other'].map(
      activeAppTabForPathname,
    ),
  ).toEqual(Array(4).fill(null));
});
it('uses Home for signed-in web and Android, Podcast for guests and iOS, and Home for bundle links', () => {
  for (const platformOS of ['web', 'android', 'ios']) {
    expect(
      resolveLandingPath({
        platformOS,
        hasBundleView: true,
        wasSignedIn: false,
      }),
    ).toBe('/home');
    expect(
      resolveLandingPath({
        platformOS,
        hasBundleView: false,
        wasSignedIn: false,
      }),
    ).toBe('/podcast');
    expect(
      resolveLandingPath({
        platformOS,
        hasBundleView: false,
        wasSignedIn: true,
      }),
    ).toBe(platformOS === 'ios' ? '/podcast' : '/home');
  }
});
