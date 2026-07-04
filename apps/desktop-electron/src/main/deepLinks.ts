import { resolve } from 'node:path';

import { app } from 'electron';

/**
 * Matches the Expo app scheme in apps/mobile-v2/app.config.ts (C5): the same
 * deep links resolve on iOS/Android (Expo) and macOS (this shell).
 */
export const DEEP_LINK_SCHEME = 'zappilotv2';

export function registerDeepLinkScheme(): void {
  if (process.defaultApp && process.argv[1]) {
    // Dev mode: `electron .` — register with explicit argv so macOS/Windows
    // route the scheme back to this checkout.
    app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME, process.execPath, [
      resolve(process.argv[1]),
    ]);
    return;
  }
  app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);
}

/** Extracts a zappilotv2:// URL from second-instance / cold-start argv. */
export function extractDeepLink(argv: readonly string[]): string | undefined {
  return argv.find((arg) => arg.startsWith(`${DEEP_LINK_SCHEME}://`));
}
