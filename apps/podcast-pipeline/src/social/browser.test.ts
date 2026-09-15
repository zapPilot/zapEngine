import { EventEmitter } from 'node:events';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const childProcess = vi.hoisted(() => ({ spawn: vi.fn() }));
const fs = vi.hoisted(() => ({ existsSync: vi.fn() }));

vi.mock('node:child_process', () => ({ spawn: childProcess.spawn }));
vi.mock('node:fs', () => ({ existsSync: fs.existsSync }));
vi.mock('playwright-core', () => ({
  chromium: { launchPersistentContext: vi.fn() },
}));

import { launchManualChrome } from './browser.js';

const CHROME_PATH =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = '/Users/operator/.zap-pilot/x-chrome-profile';
const START_URL = 'https://x.com/login';

function fakeChrome() {
  return Object.assign(new EventEmitter(), { kill: vi.fn() });
}

function spawnArgs(): string[] {
  return childProcess.spawn.mock.calls[0]?.[1] as string[];
}

beforeEach(() => {
  childProcess.spawn.mockReset();
  fs.existsSync.mockReset();
  fs.existsSync.mockReturnValue(true);
});

describe('launchManualChrome', () => {
  it('mirrors the cookie-encryption switches and drives no automation', async () => {
    const child = fakeChrome();
    childProcess.spawn.mockReturnValue(child);

    const closed = launchManualChrome(PROFILE, START_URL);
    child.emit('exit', 0, null);
    await expect(closed).resolves.toBeUndefined();

    expect(childProcess.spawn.mock.calls[0]?.[0]).toBe(CHROME_PATH);
    // Playwright encrypts this profile's cookies against a mock keychain; a
    // login that writes them under the real macOS Keychain key is unreadable
    // when the publisher reopens the profile.
    expect(spawnArgs()).toEqual(
      expect.arrayContaining([
        `--user-data-dir=${PROFILE}`,
        '--password-store=basic',
        '--use-mock-keychain',
        START_URL,
      ]),
    );
    expect(
      spawnArgs().filter(
        (argument) =>
          argument.startsWith('--remote-debugging') ||
          argument.startsWith('--enable-automation'),
      ),
    ).toEqual([]);
  });

  it('refuses to start when Chrome is not installed where it is expected', () => {
    fs.existsSync.mockReturnValue(false);

    expect(() => launchManualChrome(PROFILE, START_URL)).toThrow(CHROME_PATH);
    expect(childProcess.spawn).not.toHaveBeenCalled();
  });

  it('propagates a failure to start Chrome', async () => {
    const child = fakeChrome();
    childProcess.spawn.mockReturnValue(child);

    const closed = launchManualChrome(PROFILE, START_URL);
    child.emit('error', new Error('spawn EACCES'));
    await expect(closed).rejects.toThrow('spawn EACCES');
  });

  it('closes a window that is still open at the deadline instead of hanging', async () => {
    const child = fakeChrome();
    child.kill.mockImplementation(() => {
      setImmediate(() => child.emit('exit', null, 'SIGTERM'));
      return true;
    });
    childProcess.spawn.mockReturnValue(child);

    await expect(launchManualChrome(PROFILE, START_URL, 5)).rejects.toThrow(
      /still open/,
    );
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });
});
