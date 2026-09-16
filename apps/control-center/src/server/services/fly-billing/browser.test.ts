import { homedir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const launchPersistentContext = vi.hoisted(() => vi.fn());

vi.mock('playwright-core', () => ({
  chromium: { launchPersistentContext },
}));

import { FLY_CHROME_PROFILE, launchFlyChrome } from './browser.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('launchFlyChrome', () => {
  it('keeps the Fly session in its own profile beside the social profiles', () => {
    expect(FLY_CHROME_PROFILE).toBe(
      join(homedir(), '.zap-pilot', 'fly-chrome-profile'),
    );
    expect(FLY_CHROME_PROFILE.endsWith('.zap-pilot/fly-chrome-profile')).toBe(
      true,
    );
  });

  it('launches headless by default', async () => {
    const context = { id: 'default' };
    launchPersistentContext.mockResolvedValueOnce(context);

    await expect(launchFlyChrome()).resolves.toBe(context);
    expect(launchPersistentContext).toHaveBeenCalledWith(FLY_CHROME_PROFILE, {
      channel: 'chrome',
      headless: true,
      viewport: { width: 1440, height: 900 },
    });
  });

  it('opens a visible window when the caller asks for interaction', async () => {
    const context = { id: 'interactive' };
    launchPersistentContext.mockResolvedValueOnce(context);

    await expect(launchFlyChrome({ headless: false })).resolves.toBe(context);
    expect(launchPersistentContext).toHaveBeenCalledWith(FLY_CHROME_PROFILE, {
      channel: 'chrome',
      headless: false,
      viewport: { width: 1440, height: 900 },
    });
  });

  it('returns whatever the browser hands back', async () => {
    const context = { id: 'explicit-headless' };
    launchPersistentContext.mockResolvedValueOnce(context);

    await expect(launchFlyChrome({ headless: true })).resolves.toBe(context);
    expect(launchPersistentContext).toHaveBeenCalledWith(
      FLY_CHROME_PROFILE,
      expect.objectContaining({ headless: true }),
    );
  });
});
