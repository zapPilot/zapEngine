import { type BrowserContext, chromium } from 'playwright-core';

// Every platform launches its own persistent Chrome profile the same way:
// the system Chrome channel, at a fixed viewport, headless only when the
// caller asks. Centralizing the launch call keeps that agreement in one
// place while each platform still owns its own profile directory and page
// lifecycle.
export async function launchPersistentChrome(
  profileDirectory: string,
  options: { headless?: boolean } = {},
): Promise<BrowserContext> {
  return chromium.launchPersistentContext(profileDirectory, {
    channel: 'chrome',
    headless: options.headless ?? false,
    viewport: { width: 1440, height: 900 },
  });
}
