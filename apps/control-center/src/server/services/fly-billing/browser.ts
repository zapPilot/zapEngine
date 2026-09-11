import { homedir } from 'node:os';
import { join } from 'node:path';

import { type BrowserContext, chromium } from 'playwright-core';

/**
 * The Chrome profile that holds the Fly dashboard session.
 *
 * Fly's web dashboard authenticates by cookie -- a Fly API token is rejected
 * there, so the only way to read the billing page is a browser that has been
 * logged in once and kept its profile. It sits beside the social publishers'
 * profiles under `~/.zap-pilot/`, outside the repository, and deliberately in
 * its own directory: a persistent profile cannot be opened twice at once, so
 * sharing one with the social daemon would make the two starve each other.
 */
export const FLY_CHROME_PROFILE = join(
  homedir(),
  '.zap-pilot',
  'fly-chrome-profile',
);

/**
 * Mirrors `apps/podcast-pipeline/src/social/browser.ts`. The duplication is
 * deliberate: that launcher lives in a different workspace, and the alternative
 * -- a shared package -- would put a browser dependency on the import path of
 * anything that touched it. This app ships to Vercel, so the one thing that
 * must stay true is that nothing reachable from the HTTP entry point imports
 * this file.
 */
export async function launchFlyChrome(
  options: { headless?: boolean } = {},
): Promise<BrowserContext> {
  return chromium.launchPersistentContext(FLY_CHROME_PROFILE, {
    channel: 'chrome',
    headless: options.headless ?? true,
    viewport: { width: 1440, height: 900 },
  });
}
