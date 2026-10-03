import { describe, expect, it } from 'vitest';

import {
  buildBundleShareUrl,
  DEFAULT_APP_WEB_ORIGIN,
  isBundleSharePath,
  resolveBundleUrlSearch,
  resolveShareOrigin,
} from '../src/integration/bundleShareModel';

const OWN_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const VISITED_ID = '5fc63d4e-4e07-47d8-840b-ccd3420d553f';

describe('buildBundleShareUrl', () => {
  it('builds <origin>/home?userId=<uuid>', () => {
    expect(buildBundleShareUrl('https://v2.zap-pilot.org', OWN_ID)).toBe(
      `https://v2.zap-pilot.org/home?userId=${OWN_ID}`,
    );
  });

  it('normalizes a trailing slash on the origin', () => {
    expect(buildBundleShareUrl('http://localhost:8081/', OWN_ID)).toBe(
      `http://localhost:8081/home?userId=${OWN_ID}`,
    );
  });
});

describe('resolveShareOrigin', () => {
  it('prefers a provided origin', () => {
    expect(resolveShareOrigin('http://localhost:8081')).toBe(
      'http://localhost:8081',
    );
  });

  it('strips a trailing slash', () => {
    expect(resolveShareOrigin('https://example.com/')).toBe(
      'https://example.com',
    );
  });

  it('falls back to the default origin for blank/nullish input', () => {
    expect(resolveShareOrigin(null)).toBe(DEFAULT_APP_WEB_ORIGIN);
    expect(resolveShareOrigin(undefined)).toBe(DEFAULT_APP_WEB_ORIGIN);
    expect(resolveShareOrigin('   ')).toBe(DEFAULT_APP_WEB_ORIGIN);
  });
});

describe('isBundleSharePath', () => {
  it('accepts the portfolio routes', () => {
    expect(isBundleSharePath('/home')).toBe(true);
    expect(isBundleSharePath('/portfolio')).toBe(true);
    expect(isBundleSharePath('/home/')).toBe(true);
  });

  it('rejects non-portfolio routes', () => {
    expect(isBundleSharePath('/podcast')).toBe(false);
    expect(isBundleSharePath('/activity')).toBe(false);
    expect(isBundleSharePath('/')).toBe(false);
  });
});

describe('resolveBundleUrlSearch', () => {
  it('leaves unrelated routes alone', () => {
    expect(
      resolveBundleUrlSearch({
        pathname: '/podcast',
        search: '?userId=old',
        viewingUserId: OWN_ID,
      }),
    ).toBeNull();
  });
  it('sets the viewed bundle after search or login', () => {
    expect(
      resolveBundleUrlSearch({
        pathname: '/home',
        search: '?x=1',
        viewingUserId: OWN_ID,
      }),
    ).toBe(`x=1&userId=${OWN_ID}`);
    expect(
      resolveBundleUrlSearch({
        pathname: '/portfolio',
        search: `?userId=${OWN_ID}`,
        viewingUserId: VISITED_ID,
      }),
    ).toBe(`userId=${VISITED_ID}`);
  });
  it('restores the visited param after a tab roundtrip', () => {
    expect(
      resolveBundleUrlSearch({
        pathname: '/home',
        search: '',
        viewingUserId: VISITED_ID,
      }),
    ).toBe(`userId=${VISITED_ID}`);
  });
  it('does not write an already canonical query', () => {
    expect(
      resolveBundleUrlSearch({
        pathname: '/home',
        search: `?userId=${OWN_ID}`,
        viewingUserId: OWN_ID,
      }),
    ).toBeNull();
  });
  it('clears the bundle on logout while preserving other params', () => {
    expect(
      resolveBundleUrlSearch({
        pathname: '/home',
        search: '?userId=old&x=1',
        viewingUserId: null,
      }),
    ).toBe('x=1');
    expect(
      resolveBundleUrlSearch({
        pathname: '/home',
        search: '?userId=old',
        viewingUserId: null,
      }),
    ).toBe('');
    expect(
      resolveBundleUrlSearch({
        pathname: '/home',
        search: '',
        viewingUserId: null,
      }),
    ).toBeNull();
  });
  it('shares the production origin from the desktop loopback runtime', () => {
    expect(resolveShareOrigin('http://127.0.0.1:3105', 'desktop')).toBe(
      DEFAULT_APP_WEB_ORIGIN,
    );
  });
});
