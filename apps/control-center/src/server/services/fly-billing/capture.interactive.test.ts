import type { BrowserContext } from 'playwright-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const launchFlyChrome = vi.hoisted(() => vi.fn());
const restoreFlySession = vi.hoisted(() => vi.fn());
const saveFlySession = vi.hoisted(() => vi.fn());
const parseFlyBillingHtml = vi.hoisted(() => vi.fn());

vi.mock('./browser.js', () => ({ launchFlyChrome }));
vi.mock('./session.js', () => ({ restoreFlySession, saveFlySession }));
vi.mock('./parse.js', () => ({ parseFlyBillingHtml }));

import { captureFlyBilling, FLY_BILLING_URL } from './capture.js';

const READING = {
  upcomingInvoiceUsd: 4.57,
  lastInvoiceUsd: 14.69,
  creditBalanceUsd: 0,
};

function page(url: string) {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    content: vi.fn().mockResolvedValue('<html>billing</html>'),
    url: vi.fn(() => url),
  };
}

function contextFor(
  p: ReturnType<typeof page>,
  overrides: { close?: () => Promise<unknown> } = {},
) {
  return {
    pages: () => [],
    newPage: vi.fn().mockResolvedValue(p),
    close: vi.fn(() =>
      overrides.close ? overrides.close() : Promise.resolve(),
    ),
    cookies: vi.fn(),
    addCookies: vi.fn(),
  } as unknown as BrowserContext;
}

function contextWithExistingPage(p: ReturnType<typeof page>) {
  return {
    pages: () => [p],
    newPage: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
    cookies: vi.fn(),
    addCookies: vi.fn(),
  } as unknown as BrowserContext;
}

function immediatePollTimers() {
  const realSetTimeout = globalThis.setTimeout;
  return vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
    handler: () => void,
    ms?: number,
  ) => {
    if (ms === 1_000 || ms === 3_000) {
      handler();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }
    return realSetTimeout(handler, ms);
  }) as typeof setTimeout);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  parseFlyBillingHtml.mockReturnValue({ ...READING });
  restoreFlySession.mockResolvedValue(0);
  saveFlySession.mockResolvedValue(0);
});

describe('captureFlyBilling interactive branches', () => {
  it('reuses the open page instead of opening another', async () => {
    const p = page(FLY_BILLING_URL);
    const ctx = contextWithExistingPage(p);
    launchFlyChrome.mockResolvedValueOnce(ctx);

    const result = await captureFlyBilling({
      now: () => new Date('2026-09-01T00:00:00.000Z'),
    });

    expect(result.status).toBe('captured');
    expect(ctx.newPage).not.toHaveBeenCalled();
    expect(p.goto).toHaveBeenCalledWith(FLY_BILLING_URL, {
      waitUntil: 'domcontentloaded',
    });
    expect(launchFlyChrome).toHaveBeenCalledWith({ headless: true });
  });

  it('reports auth_required for a /app/auth/ redirect without interactivity', async () => {
    parseFlyBillingHtml.mockImplementationOnce(() => {
      throw new Error('no money');
    });
    const nowSpy = vi
      .spyOn(Date, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValue(60_000);
    try {
      const p = page('https://fly.io/app/auth/cli?next=/dashboard');
      const ctx = contextFor(p);
      launchFlyChrome.mockResolvedValueOnce(ctx);
      restoreFlySession.mockResolvedValueOnce(0);

      const result = await captureFlyBilling();
      expect(result).toEqual({ status: 'auth_required' });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('maps a string launch rejection to its raw reason', async () => {
    launchFlyChrome.mockRejectedValueOnce('disk full');
    const result = await captureFlyBilling();
    expect(result).toEqual({
      status: 'unavailable',
      reason: 'disk full',
    });
  });

  it('skips the save log when no cookie needs persisting', async () => {
    const p = page(FLY_BILLING_URL);
    const ctx = contextFor(p);
    launchFlyChrome.mockResolvedValueOnce(ctx);
    restoreFlySession.mockResolvedValueOnce(0);
    saveFlySession.mockResolvedValueOnce(0);
    const logs: string[] = [];

    const result = await captureFlyBilling({
      onLog: (message) => logs.push(message),
      now: () => new Date('2026-09-01T00:00:00.000Z'),
    });

    expect(result.status).toBe('captured');
    expect(logs.join('\n')).not.toContain('saved');
  });

  it('swallows a close failure after a confirmed read', async () => {
    const p = page(FLY_BILLING_URL);
    const ctx = contextFor(p, {
      close: () => Promise.reject(new Error('close boom')),
    });
    launchFlyChrome.mockResolvedValueOnce(ctx);
    restoreFlySession.mockResolvedValueOnce(0);
    saveFlySession.mockResolvedValueOnce(1);

    const result = await captureFlyBilling({
      now: () => new Date('2026-09-01T00:00:00.000Z'),
    });

    expect(result.status).toBe('captured');
    expect(ctx.close).toHaveBeenCalled();
  });

  it('maps a mid-capture Error to unavailable with its message', async () => {
    const p = page(FLY_BILLING_URL);
    p.goto.mockRejectedValueOnce(new Error('nav exploded'));
    const ctx = contextFor(p);
    launchFlyChrome.mockResolvedValueOnce(ctx);
    restoreFlySession.mockResolvedValueOnce(0);

    const result = await captureFlyBilling();
    expect(result).toEqual({
      status: 'unavailable',
      reason: 'nav exploded',
    });
    expect(ctx.close).toHaveBeenCalled();
  });

  it('waits for a sign-in then captures on the second read', async () => {
    parseFlyBillingHtml
      .mockImplementationOnce(() => {
        throw new Error('signed out');
      })
      .mockReturnValueOnce({ ...READING });
    const dates = [0, 60_000, 1_000_000, 1_000_000, 1_000_000];
    const nowSpy = vi
      .spyOn(Date, 'now')
      .mockImplementation(() => dates.shift() ?? 2_000_000);
    const timeoutSpy = immediatePollTimers();
    try {
      const p = page('https://fly.io/app/sign-in');
      p.url
        .mockReturnValueOnce('https://fly.io/app/sign-in')
        .mockReturnValue('https://fly.io/dashboard/chang-tai-wei/billing');
      const ctx = contextFor(p);
      launchFlyChrome.mockResolvedValueOnce(ctx);
      restoreFlySession.mockResolvedValueOnce(0);
      saveFlySession.mockResolvedValueOnce(0);
      const logs: string[] = [];

      const result = await captureFlyBilling({
        interactive: true,
        onLog: (message) => logs.push(message),
        now: () => new Date('2026-09-01T00:00:00.000Z'),
      });

      expect(result.status).toBe('captured');
      expect(logs.join('\n')).toContain('Fly needs a sign-in');
      expect(p.goto).toHaveBeenCalledTimes(2);
      expect(launchFlyChrome).toHaveBeenCalledWith({ headless: false });
    } finally {
      nowSpy.mockRestore();
      timeoutSpy.mockRestore();
    }
  }, 15000);

  it('reports auth_required when the sign-in window times out', async () => {
    parseFlyBillingHtml.mockImplementation(() => {
      throw new Error('signed out');
    });
    const nowSpy = vi
      .spyOn(Date, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(60_000)
      .mockReturnValueOnce(0)
      .mockReturnValue(400_000);
    const timeoutSpy = immediatePollTimers();
    try {
      const p = page('https://fly.io/app/sign-in');
      p.url.mockReturnValue('https://fly.io/app/sign-in');
      const ctx = contextFor(p);
      launchFlyChrome.mockResolvedValueOnce(ctx);
      restoreFlySession.mockResolvedValueOnce(0);
      const logs: string[] = [];

      const result = await captureFlyBilling({
        interactive: true,
        onLog: (message) => logs.push(message),
      });

      expect(result).toEqual({ status: 'auth_required' });
      expect(logs.join('\n')).toContain('sign-in did not finish in time');
    } finally {
      nowSpy.mockRestore();
      timeoutSpy.mockRestore();
    }
  }, 15000);

  it('reports the billing page when the second read still has no figure', async () => {
    parseFlyBillingHtml.mockImplementation(() => {
      throw new Error('still signed out');
    });
    const nowSpy = vi
      .spyOn(Date, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(60_000)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(60_000);
    const timeoutSpy = immediatePollTimers();
    try {
      const p = page(FLY_BILLING_URL);
      const ctx = contextFor(p);
      launchFlyChrome.mockResolvedValueOnce(ctx);
      restoreFlySession.mockResolvedValueOnce(0);

      const result = await captureFlyBilling({ interactive: true });

      expect(result.status).toBe('unavailable');
      expect((result as { reason: string }).reason).toContain('did not render');
      expect(p.goto).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
      timeoutSpy.mockRestore();
    }
  }, 15000);
});
