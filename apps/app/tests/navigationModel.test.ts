import { describe, expect, it } from 'vitest';
import {
  activeAppTabForPathname,
  resolveLandingPath,
  APP_TAB_NAMES,
  APP_ROUTES,
  defaultTabFor,
} from '@/integration/navigationModel';
describe('three app places', () => {
  it('uses Today except on podcast-first iOS', () => {
    expect(APP_TAB_NAMES).toEqual(['today', 'listen', 'runtime']);
    expect(defaultTabFor('web')).toBe('today');
    expect(defaultTabFor('android')).toBe('today');
    expect(defaultTabFor('ios')).toBe('listen');
  });
  it('keeps nested pages in their owning tab without matching unrelated prefixes', () => {
    expect(
      ['/today', '/today/decision?x=1', '/portfolio/'].map(
        activeAppTabForPathname,
      ),
    ).toEqual(Array(3).fill('today'));
    expect(
      ['/listen', '/podcast/id?lang=en', '/e', '/e/id'].map(
        activeAppTabForPathname,
      ),
    ).toEqual(Array(4).fill('listen'));
    expect(
      ['/runtime', '/runtime/alerts', '/wallets/'].map(activeAppTabForPathname),
    ).toEqual(Array(3).fill('runtime'));
    expect(
      [
        '/',
        '/today-other',
        '/runtime-other',
        '/podcast',
        '/home',
        '/strategy',
        '/send',
        '/unknown',
      ].map(activeAppTabForPathname),
    ).toEqual(Array(8).fill(null));
  });
  it('prioritizes public bundles, iOS playback, signed-in sessions, then first run', () => {
    for (const platformOS of ['web', 'android', 'ios']) {
      for (const wasSignedIn of [false, true])
        for (const hasSeenFirstRun of [false, true]) {
          expect(
            resolveLandingPath({
              platformOS,
              wasSignedIn,
              hasSeenFirstRun,
              hasBundleView: true,
            }),
          ).toBe(APP_ROUTES.today);
          expect(
            resolveLandingPath({
              platformOS,
              wasSignedIn,
              hasSeenFirstRun,
              hasBundleView: false,
            }),
          ).toBe(
            platformOS === 'ios'
              ? APP_ROUTES.listen
              : wasSignedIn || hasSeenFirstRun
                ? APP_ROUTES.today
                : APP_ROUTES.welcome,
          );
        }
    }
  });
});
