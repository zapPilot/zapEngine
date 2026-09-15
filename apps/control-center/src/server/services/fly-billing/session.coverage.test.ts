import type { BrowserContext } from 'playwright-core';
import { describe, expect, it, vi } from 'vitest';

import { restoreFlySession, saveFlySession } from './session.js';

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  renameSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

const mockedRead = vi.mocked(readFileSync);
const mockedWrite = vi.mocked(writeFileSync);
const mockedMkdir = vi.mocked(mkdirSync);
const mockedRename = vi.mocked(renameSync);

function contextWith(cookies: unknown[]) {
  return {
    cookies: vi.fn().mockResolvedValue(cookies),
    addCookies: vi.fn().mockResolvedValue(undefined),
  } as unknown as BrowserContext;
}

function flyCookie(overrides: Record<string, unknown> = {}) {
  return {
    name: 'fly_session',
    value: 'v',
    domain: 'fly.io',
    path: '/',
    expires: -1,
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    ...overrides,
  };
}

describe('fly session coverage', () => {
  it('keeps the on-disk session when Fly issues nothing new', async () => {
    const context = contextWith([]);
    await expect(saveFlySession(context)).resolves.toBe(0);
    expect(mockedWrite).not.toHaveBeenCalled();
  });

  it('persists stamped session cookies atomically', async () => {
    const context = contextWith([flyCookie(), flyCookie({ name: 'other' })]);
    const saved = await saveFlySession(context);
    expect(saved).toBe(2);
    expect(mockedMkdir).toHaveBeenCalled();
    expect(mockedWrite).toHaveBeenCalledTimes(1);
    expect(mockedRename).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(mockedWrite.mock.calls[0]?.[1]));
    expect(payload.cookies).toHaveLength(2);
    expect(payload.cookies[0].expires).toBeGreaterThan(0);
  });

  it('returns zero when no session file exists', async () => {
    mockedRead.mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });
    const context = contextWith([]);
    await expect(restoreFlySession(context)).resolves.toBe(0);
    expect(context.addCookies).not.toHaveBeenCalled();
  });

  it('returns zero for an empty or malformed stored session', async () => {
    mockedRead
      .mockReturnValueOnce(JSON.stringify({ savedAt: 'x', cookies: [] }))
      .mockReturnValueOnce('not-json');
    const first = contextWith([]);
    await expect(restoreFlySession(first)).resolves.toBe(0);
    const second = contextWith([]);
    await expect(restoreFlySession(second)).resolves.toBe(0);
  });

  it('restores stored cookies into a fresh context', async () => {
    const stored = {
      savedAt: new Date().toISOString(),
      cookies: [flyCookie()],
    };
    mockedRead.mockReturnValueOnce(JSON.stringify(stored));
    const context = contextWith([]);
    await expect(restoreFlySession(context)).resolves.toBe(1);
    expect(context.addCookies).toHaveBeenCalledWith(stored.cookies);
  });
});
