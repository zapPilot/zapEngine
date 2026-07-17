import { describe, expect, it } from 'vitest';

import {
  parseBundleViewUserId,
  resolveViewingState,
} from '../src/integration/bundleViewModel';

const BUNDLE_ID = '5fc63d4e-4e07-47d8-840b-ccd3420d553f';
const OWN_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('parseBundleViewUserId', () => {
  it('accepts a UUID with or without a leading question mark', () => {
    expect(parseBundleViewUserId(`?userId=${BUNDLE_ID}`)).toBe(BUNDLE_ID);
    expect(parseBundleViewUserId(`userId=${BUNDLE_ID}`)).toBe(BUNDLE_ID);
  });

  it('lowercases mixed-case UUIDs', () => {
    expect(parseBundleViewUserId(`?userId=${BUNDLE_ID.toUpperCase()}`)).toBe(
      BUNDLE_ID,
    );
  });

  it('ignores unrelated params around the userId', () => {
    expect(parseBundleViewUserId(`?foo=bar&userId=${BUNDLE_ID}&baz=1`)).toBe(
      BUNDLE_ID,
    );
  });

  it('trims surrounding whitespace before validating', () => {
    expect(parseBundleViewUserId(`?userId=%20${BUNDLE_ID}%20`)).toBe(BUNDLE_ID);
  });

  it('rejects wallet addresses, garbage, and missing params', () => {
    expect(
      parseBundleViewUserId(
        '?userId=0x1234567890123456789012345678901234567890',
      ),
    ).toBeNull();
    expect(parseBundleViewUserId('?userId=not-a-uuid')).toBeNull();
    expect(parseBundleViewUserId('?userId=')).toBeNull();
    expect(parseBundleViewUserId('?other=1')).toBeNull();
    expect(parseBundleViewUserId('')).toBeNull();
    expect(parseBundleViewUserId(null)).toBeNull();
    expect(parseBundleViewUserId(undefined)).toBeNull();
  });
});

describe('resolveViewingState', () => {
  it('keeps a logged-out visitor without a param in demo mode', () => {
    expect(
      resolveViewingState({
        urlUserId: null,
        ownUserId: null,
        isConnected: false,
        loadingUser: false,
      }),
    ).toEqual({
      viewingUserId: null,
      isOwnBundle: true,
      isResolvingViewingUser: false,
      isDemo: true,
    });
  });

  it('shows a bundle read-only to a logged-out visitor with a param', () => {
    expect(
      resolveViewingState({
        urlUserId: BUNDLE_ID,
        ownUserId: null,
        isConnected: false,
        loadingUser: false,
      }),
    ).toEqual({
      viewingUserId: BUNDLE_ID,
      isOwnBundle: false,
      isResolvingViewingUser: false,
      isDemo: false,
    });
  });

  it('reports resolving instead of demo while the user record settles', () => {
    expect(
      resolveViewingState({
        urlUserId: null,
        ownUserId: null,
        isConnected: true,
        loadingUser: true,
      }),
    ).toEqual({
      viewingUserId: null,
      isOwnBundle: true,
      isResolvingViewingUser: true,
      isDemo: false,
    });
  });

  it('views the own bundle once the user record resolves', () => {
    expect(
      resolveViewingState({
        urlUserId: null,
        ownUserId: OWN_ID,
        isConnected: true,
        loadingUser: false,
      }),
    ).toEqual({
      viewingUserId: OWN_ID,
      isOwnBundle: true,
      isResolvingViewingUser: false,
      isDemo: false,
    });
  });

  it('keeps owner affordances when the param matches the own id', () => {
    expect(
      resolveViewingState({
        urlUserId: OWN_ID,
        ownUserId: OWN_ID,
        isConnected: true,
        loadingUser: false,
      }),
    ).toEqual({
      viewingUserId: OWN_ID,
      isOwnBundle: true,
      isResolvingViewingUser: false,
      isDemo: false,
    });
  });

  it('hides owner affordances when viewing another bundle', () => {
    expect(
      resolveViewingState({
        urlUserId: BUNDLE_ID,
        ownUserId: OWN_ID,
        isConnected: true,
        loadingUser: false,
      }),
    ).toEqual({
      viewingUserId: BUNDLE_ID,
      isOwnBundle: false,
      isResolvingViewingUser: false,
      isDemo: false,
    });
  });

  it('lets a param win immediately even while the own record resolves', () => {
    expect(
      resolveViewingState({
        urlUserId: BUNDLE_ID,
        ownUserId: null,
        isConnected: true,
        loadingUser: true,
      }),
    ).toEqual({
      viewingUserId: BUNDLE_ID,
      isOwnBundle: false,
      isResolvingViewingUser: false,
      isDemo: false,
    });
  });
});
