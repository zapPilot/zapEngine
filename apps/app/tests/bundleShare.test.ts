import { describe, expect, it } from 'vitest';

import {
  buildBundleShareUrl,
  DEFAULT_APP_WEB_ORIGIN,
  isBundleSharePath,
  resolveOwnBundleUrlSearch,
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

describe('resolveOwnBundleUrlSearch', () => {
  it('never touches a non-portfolio route', () => {
    expect(
      resolveOwnBundleUrlSearch({
        pathname: '/podcast',
        search: '',
        latchedUrlUserId: null,
        ownUserId: OWN_ID,
      }),
    ).toBeNull();
  });

  it('never overwrites a visited bundle param, even when logged in', () => {
    expect(
      resolveOwnBundleUrlSearch({
        pathname: '/home',
        search: `?userId=${VISITED_ID}`,
        latchedUrlUserId: VISITED_ID,
        ownUserId: OWN_ID,
      }),
    ).toBeNull();
  });

  it('keeps a visited view after a tab roundtrip drops the param', () => {
    expect(
      resolveOwnBundleUrlSearch({
        pathname: '/home',
        search: '',
        latchedUrlUserId: VISITED_ID,
        ownUserId: OWN_ID,
      }),
    ).toBeNull();
  });

  it('writes the own userId onto an empty query', () => {
    expect(
      resolveOwnBundleUrlSearch({
        pathname: '/home',
        search: '',
        latchedUrlUserId: null,
        ownUserId: OWN_ID,
      }),
    ).toBe(`userId=${OWN_ID}`);
  });

  it('is idempotent when the own userId is already present', () => {
    expect(
      resolveOwnBundleUrlSearch({
        pathname: '/portfolio',
        search: `?userId=${OWN_ID}`,
        latchedUrlUserId: OWN_ID,
        ownUserId: OWN_ID,
      }),
    ).toBeNull();
  });

  it('preserves unrelated params when adding the own userId', () => {
    expect(
      resolveOwnBundleUrlSearch({
        pathname: '/home',
        search: '?tab=invest',
        latchedUrlUserId: null,
        ownUserId: OWN_ID,
      }),
    ).toBe(`tab=invest&userId=${OWN_ID}`);
  });

  it('re-applies the own userId after a tab roundtrip (latch matches own id)', () => {
    expect(
      resolveOwnBundleUrlSearch({
        pathname: '/home',
        search: '',
        latchedUrlUserId: OWN_ID,
        ownUserId: OWN_ID,
      }),
    ).toBe(`userId=${OWN_ID}`);
  });

  it('rewrites the param after an account switch', () => {
    expect(
      resolveOwnBundleUrlSearch({
        pathname: '/home',
        search: `?userId=${VISITED_ID}`,
        latchedUrlUserId: null,
        ownUserId: OWN_ID,
      }),
    ).toBe(`userId=${OWN_ID}`);
  });

  it('strips a self-written param on logout', () => {
    expect(
      resolveOwnBundleUrlSearch({
        pathname: '/home',
        search: `?userId=${OWN_ID}`,
        latchedUrlUserId: null,
        ownUserId: null,
      }),
    ).toBe('');
  });

  it('does nothing for a logged-out demo visitor with no param', () => {
    expect(
      resolveOwnBundleUrlSearch({
        pathname: '/home',
        search: '',
        latchedUrlUserId: null,
        ownUserId: null,
      }),
    ).toBeNull();
  });
});
