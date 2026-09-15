import { readFileSync } from 'node:fs';

import type { BrowserContext } from 'playwright-core';
import { describe, expect, it, vi } from 'vitest';

import { captureFlyBilling, FLY_BILLING_URL } from './capture.js';

const BILLING_PAGE = readFileSync(
  new URL('./__fixtures__/billing-page.html', import.meta.url),
  'utf8',
);

const launchFlyChrome = vi.hoisted(() => vi.fn());
const restoreFlySession = vi.hoisted(() => vi.fn());
const saveFlySession = vi.hoisted(() => vi.fn());

vi.mock('./browser.js', () => ({ launchFlyChrome }));
vi.mock('./session.js', () => ({ restoreFlySession, saveFlySession }));

function page(url: string, html = BILLING_PAGE) {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    content: vi.fn().mockResolvedValue(html),
    url: vi.fn(() => url),
  };
}

function contextFor(p: ReturnType<typeof page>) {
  return {
    pages: () => [],
    newPage: vi.fn().mockResolvedValue(p),
    close: vi.fn().mockResolvedValue(undefined),
    cookies: vi.fn(),
    addCookies: vi.fn(),
  } as unknown as BrowserContext;
}

describe('captureFlyBilling coverage', () => {
  it('exposes the single billing URL', () => {
    expect(FLY_BILLING_URL).toContain('fly.io/dashboard/');
  });

  it('reports unavailable when Chrome cannot launch', async () => {
    launchFlyChrome.mockRejectedValueOnce(new Error('no chrome executable'));
    const result = await captureFlyBilling();
    expect(result).toMatchObject({ status: 'unavailable' });
    expect((result as { reason: string }).reason).toContain('Google Chrome');
  });

  it('reports the raw reason for a non-Chrome launch failure', async () => {
    launchFlyChrome.mockRejectedValueOnce(new Error('disk full'));
    const result = await captureFlyBilling();
    expect(result).toEqual({ status: 'unavailable', reason: 'disk full' });
  });

  it('captures and saves the session after a confirmed read', async () => {
    const p = page(FLY_BILLING_URL);
    const ctx = contextFor(p);
    launchFlyChrome.mockResolvedValueOnce(ctx);
    restoreFlySession.mockResolvedValueOnce(2);
    saveFlySession.mockResolvedValueOnce(1);
    const logs: string[] = [];
    const result = await captureFlyBilling({
      onLog: (m) => logs.push(m),
      now: () => new Date('2026-09-01T00:00:00.000Z'),
    });
    expect(result.status).toBe('captured');
    expect(logs.join('\n')).toContain('restored 2');
    expect(logs.join('\n')).toContain('saved 1');
    expect(ctx.close).toHaveBeenCalled();
  });

  it('reports auth_required for a sign-in redirect without interactivity', async () => {
    const p = page('https://fly.io/app/sign-in', '<html>no money</html>');
    const ctx = contextFor(p);
    launchFlyChrome.mockResolvedValueOnce(ctx);
    restoreFlySession.mockResolvedValueOnce(0);
    saveFlySession.mockResolvedValueOnce(0);
    const result = await captureFlyBilling();
    expect(result).toEqual({ status: 'auth_required' });
  }, 40000);

  it('reports unavailable when the card never renders on the billing page', async () => {
    const p = page(FLY_BILLING_URL, '<html>no money</html>');
    const ctx = contextFor(p);
    launchFlyChrome.mockResolvedValueOnce(ctx);
    restoreFlySession.mockResolvedValueOnce(0);
    const result = await captureFlyBilling();
    expect(result.status).toBe('unavailable');
  }, 40000);

  it('maps a mid-capture exception to unavailable with a non-Error reason', async () => {
    const p = page(FLY_BILLING_URL);
    p.goto.mockRejectedValueOnce('string-boom');
    const ctx = contextFor(p);
    launchFlyChrome.mockResolvedValueOnce(ctx);
    restoreFlySession.mockResolvedValueOnce(0);
    const result = await captureFlyBilling();
    expect(result).toEqual({ status: 'unavailable', reason: 'string-boom' });
  });

  it('still closes the context when capture throws', async () => {
    const p = page(FLY_BILLING_URL);
    p.goto.mockRejectedValueOnce(new Error('nav boom'));
    const ctx = contextFor(p);
    launchFlyChrome.mockResolvedValueOnce(ctx);
    restoreFlySession.mockRejectedValueOnce(new Error('restore boom'));
    const result = await captureFlyBilling();
    expect(result.status).toBe('unavailable');
    expect(ctx.close).toHaveBeenCalled();
  });
});
