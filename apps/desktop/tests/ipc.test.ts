import { describe, expect, it } from 'vitest';

import {
  isDeepLinkUrl,
  isHttpsUrl,
  isSchedulerContext,
} from '../src/shared/ipc';

describe('isSchedulerContext', () => {
  it('accepts a valid context', () => {
    expect(
      isSchedulerContext({
        userId: 'did:privy:abc123',
        walletAddress: '0x1111111111111111111111111111111111111111',
      }),
    ).toBe(true);
  });

  it('rejects malformed wallet addresses', () => {
    expect(
      isSchedulerContext({ userId: 'u1', walletAddress: 'not-an-address' }),
    ).toBe(false);
    expect(isSchedulerContext({ userId: 'u1', walletAddress: '0x123' })).toBe(
      false,
    );
  });

  it('rejects empty userId, null, and non-objects', () => {
    expect(
      isSchedulerContext({
        userId: '',
        walletAddress: '0x1111111111111111111111111111111111111111',
      }),
    ).toBe(false);
    expect(isSchedulerContext(null)).toBe(false);
    expect(isSchedulerContext('string')).toBe(false);
    expect(isSchedulerContext(undefined)).toBe(false);
  });
});

describe('isHttpsUrl', () => {
  it('accepts https URLs only', () => {
    expect(isHttpsUrl('https://privy.io/oauth')).toBe(true);
    expect(isHttpsUrl('http://privy.io')).toBe(false);
    expect(isHttpsUrl('file:///etc/passwd')).toBe(false);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpsUrl('not a url')).toBe(false);
    expect(isHttpsUrl(42)).toBe(false);
  });
});

describe('isDeepLinkUrl', () => {
  it('matches only the app scheme', () => {
    expect(isDeepLinkUrl('zappilotv2://invest/confirm', 'zappilotv2')).toBe(
      true,
    );
    expect(isDeepLinkUrl('https://zap.example', 'zappilotv2')).toBe(false);
    expect(isDeepLinkUrl(undefined, 'zappilotv2')).toBe(false);
  });
});
