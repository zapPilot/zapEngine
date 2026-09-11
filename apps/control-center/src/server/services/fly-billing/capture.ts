import type { BrowserContext } from 'playwright-core';

import { launchFlyChrome } from './browser.js';
import { type FlyBillingReading, parseFlyBillingHtml } from './parse.js';
import { restoreFlySession, saveFlySession } from './session.js';

/**
 * The billing page of the personal organization.
 *
 * `chang-tai-wei` is the org's `rawSlug` — what the dashboard uses in URLs —
 * while the API calls the same organization `personal`. It is a constant rather
 * than configuration on purpose: routing it through the env manifest would put
 * a non-secret, single-valued string on a rail that fails the whole build when
 * it drifts, and there is only ever one billing page to read.
 */
export const FLY_BILLING_URL = 'https://fly.io/dashboard/chang-tai-wei/billing';

/** How long to let an operator finish signing in before giving up on a window. */
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;
const SIGN_IN_POLL_MS = 3_000;

/**
 * Landing on the sign-in URL does not mean a human is needed.
 *
 * The profile keeps the upstream identity provider's cookie, so Fly usually
 * re-establishes its own session by itself -- the first navigation lands on
 * `/app/sign-in` and bounces back to the dashboard a few seconds later with
 * nobody touching it. Deciding "signed out" from that first URL would open a
 * window every hour for a session that was about to work.
 */
const AUTO_SIGN_IN_GRACE_MS = 30_000;

/**
 * Readiness is "the figure parses", not "the label exists".
 *
 * Fly's dashboard is LiveView: the document the server first sends carries the
 * card's labels, and the amounts only arrive once the socket has connected and
 * the connected mount has run. Waiting for the label therefore succeeds a beat
 * too early and hands the parser a card with no money in it. Polling the parser
 * itself is both simpler and exactly the condition that matters.
 */
const READING_POLL_MS = 1_000;

export type FlyBillingCapture =
  | { status: 'captured'; reading: FlyBillingReading; capturedAt: string }
  | { status: 'auth_required' }
  | { status: 'unavailable'; reason: string };

export interface FlyBillingCaptureOptions {
  /**
   * Open a window and wait for a sign-in instead of reporting `auth_required`.
   * The daemon passes this the first time it finds no session, and not again:
   * a window that reappears every hour is worse than a line of log.
   */
  interactive?: boolean;
  onLog?: (message: string) => void;
  now?: () => Date;
}

export async function captureFlyBilling(
  options: FlyBillingCaptureOptions = {},
): Promise<FlyBillingCapture> {
  const log = options.onLog ?? (() => {});
  const now = options.now ?? (() => new Date());
  const interactive = options.interactive ?? false;

  let context: BrowserContext;
  try {
    context = await launchFlyChrome({ headless: !interactive });
  } catch (error) {
    return { status: 'unavailable', reason: browserFailure(error) };
  }

  try {
    const restored = await restoreFlySession(context);
    if (restored > 0) {
      log(`restored ${restored} saved session cookie(s)`);
    }

    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(FLY_BILLING_URL, { waitUntil: 'domcontentloaded' });

    let reading = await waitForReading(page, AUTO_SIGN_IN_GRACE_MS);

    if (!reading) {
      if (!interactive) {
        return signedOutOrBroken(page.url());
      }
      log('Fly needs a sign-in — complete it in the window that just opened.');
      const signedIn = await waitForSignIn(page, log);
      if (!signedIn) {
        return { status: 'auth_required' };
      }
      await page.goto(FLY_BILLING_URL, { waitUntil: 'domcontentloaded' });
      reading = await waitForReading(page, AUTO_SIGN_IN_GRACE_MS);
      if (!reading) {
        return signedOutOrBroken(page.url());
      }
    }

    // Save after a confirmed read, not after the redirect: a sign-in that got
    // as far as a cookie but not as far as the billing page is not a session
    // worth keeping.
    const saved = await saveFlySession(context);
    if (saved > 0) {
      log(`saved ${saved} session cookie(s) for the next run`);
    }

    return {
      status: 'captured',
      reading,
      capturedAt: now().toISOString(),
    };
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await context.close().catch(() => {});
  }
}

/** Polls the parser until the card is readable, or the budget runs out. */
export async function waitForReading(
  page: { content: () => Promise<string> },
  budgetMs: number,
): Promise<FlyBillingReading | null> {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    try {
      return parseFlyBillingHtml(await page.content());
    } catch {
      if (Date.now() >= deadline) {
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, READING_POLL_MS));
    }
  }
}

/**
 * Fly serves the sign-in form from the billing URL itself, so an unreadable
 * page is far more often a session to re-establish than an outage. Saying which
 * is the difference between a log line an operator acts on and one they ignore.
 */
function signedOutOrBroken(url: string): FlyBillingCapture {
  return isSignInUrl(url)
    ? { status: 'auth_required' }
    : {
        status: 'unavailable',
        reason: `Fly billing card did not render within ${AUTO_SIGN_IN_GRACE_MS / 1000}s at ${url}`,
      };
}

function isSignInUrl(url: string): boolean {
  return url.includes('/sign-in') || url.includes('/app/auth/');
}

/**
 * Signing in goes through GitHub or Google, so the browser leaves fly.io
 * entirely and comes back. Landing on the billing URL again is the only
 * reliable finish line.
 */
async function waitForSignIn(
  page: { url: () => string },
  log: (message: string) => void,
): Promise<boolean> {
  const deadline = Date.now() + SIGN_IN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, SIGN_IN_POLL_MS));
    const url = page.url();
    if (url.startsWith('https://fly.io/dashboard/') && !isSignInUrl(url)) {
      return true;
    }
  }
  log('sign-in did not finish in time; leaving the ledger untouched');
  return false;
}

/**
 * A missing Chrome is the one failure with a remedy the operator can act on,
 * and it reads nothing like a Fly problem, so it says so.
 */
function browserFailure(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return /executable|channel|chrome/i.test(detail)
    ? `Google Chrome could not be launched for the Fly billing session: ${detail}`
    : detail;
}
