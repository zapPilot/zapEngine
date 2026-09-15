import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

import { type BrowserContext, chromium } from 'playwright-core';

import { killOnAbort, settleOnce } from '../lib/spawn-process.js';

const SYSTEM_CHROME_PATH =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MANUAL_LOGIN_TIMEOUT_MS = 900_000;

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
    chromiumSandbox: true,
    headless: options.headless ?? false,
    viewport: { width: 1440, height: 900 },
  });
}

// Logging in is the one step Playwright may not drive. X and Google both
// detect the CDP attach and refuse to finish a sign-in inside it: the Google
// OAuth popup comes back as `accounts.google.com/v3/signin/rejected`, and the
// password form routes into an X onboarding challenge instead of a session. So
// this starts the same Chrome as an ordinary browser -- no remote debugging
// pipe, none of Playwright's switches -- and only waits for the window to close.
//
// The two switches it does mirror are load-bearing. Playwright launches with
// `--use-mock-keychain` (and `--password-store=basic`), so Chrome encrypts
// `Cookies.encrypted_value` against a mock key rather than the macOS Keychain.
// A session logged in without them is encrypted with the real Keychain key and
// cannot be read back the next time Playwright opens the same profile, which
// looks exactly like never having logged in at all. Do not drop them.
export function launchManualChrome(
  profileDirectory: string,
  startUrl: string,
  timeoutMs: number = MANUAL_LOGIN_TIMEOUT_MS,
): Promise<void> {
  if (!existsSync(SYSTEM_CHROME_PATH)) {
    throw new Error(
      `Google Chrome is required for an interactive login but was not found at ${SYSTEM_CHROME_PATH}.`,
    );
  }

  const child = spawn(
    SYSTEM_CHROME_PATH,
    [
      `--user-data-dir=${profileDirectory}`,
      '--password-store=basic',
      '--use-mock-keychain',
      '--no-first-run',
      '--no-default-browser-check',
      startUrl,
    ],
    { stdio: 'ignore' },
  );

  return new Promise<void>((resolve, reject) => {
    const signal = AbortSignal.timeout(timeoutMs);
    const cancelKill = killOnAbort(child, signal);
    const { settleResolve, settleReject } = settleOnce<void>(
      resolve,
      reject,
      cancelKill,
    );
    child.on('error', settleReject);
    child.on('exit', () => {
      if (signal.aborted) {
        settleReject(
          new Error(
            `Chrome was still open ${timeoutMs / 60_000} minutes after the login prompt and was closed.`,
          ),
        );
        return;
      }
      settleResolve();
    });
  });
}
