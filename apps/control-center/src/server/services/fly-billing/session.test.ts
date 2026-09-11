import { describe, expect, it } from 'vitest';

import { selectSessionCookies } from './session.js';

const EXPIRES = 1_800_000_000;

function cookie(
  overrides: Partial<Parameters<typeof selectSessionCookies>[0][number]>,
) {
  return {
    name: 'c',
    value: 'v',
    domain: 'fly.io',
    path: '/',
    expires: -1,
    httpOnly: true,
    secure: true,
    sameSite: 'Lax' as const,
    ...overrides,
  };
}

describe('selectSessionCookies', () => {
  it('stamps an expiry on the cookies Chrome would otherwise drop', () => {
    expect(
      selectSessionCookies([cookie({ name: 'fly_session' })], EXPIRES),
    ).toEqual([
      expect.objectContaining({ name: 'fly_session', expires: EXPIRES }),
    ]);
  });

  it('accepts a subdomain the dashboard may move to', () => {
    expect(
      selectSessionCookies([cookie({ domain: '.api.fly.io' })], EXPIRES),
    ).toHaveLength(1);
  });

  // The profile is full of analytics and payment-widget cookies. Copying a
  // visitor identity to disk is not what this file is for.
  it('leaves cookies belonging to other sites alone', () => {
    expect(
      selectSessionCookies(
        [
          cookie({ domain: '.google.com', name: '_ga' }),
          cookie({ domain: 'notfly.io', name: 'decoy' }),
        ],
        EXPIRES,
      ),
    ).toEqual([]);
  });

  // A cookie that already survives a restart needs no help, and re-stamping it
  // would push its lifetime past what Fly chose.
  it('does not extend a cookie that already has an expiry', () => {
    expect(
      selectSessionCookies([cookie({ expires: 1_700_000_000 })], EXPIRES),
    ).toEqual([]);
  });
});
