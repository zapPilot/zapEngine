import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import type { BrowserContext } from 'playwright-core';

/**
 * Fly's dashboard session has to be carried across process restarts by hand.
 *
 * Signing in leaves a session cookie with no expiry, which Chrome holds in
 * memory and drops when the browser closes — so a persistent profile alone
 * gives back a signed-out browser on the next run, no matter how recently you
 * logged in. Capturing those cookies and re-adding them with a real expiry is
 * what turns "sign in once" into something true. The same trick is why the
 * social publishers keep their OAuth material in files under `~/.zap-pilot/`.
 *
 * Fly decides when the session actually dies; this file only stops the browser
 * from throwing it away first. An expired one comes back as a sign-in page,
 * which the capture reports as `auth_required` rather than as an error.
 */
const SESSION_FILE = join(homedir(), '.zap-pilot', 'fly-session.json');

/** How long a restored cookie is allowed to claim it is still good. */
const RESTORED_COOKIE_TTL_DAYS = 30;

interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
}

interface StoredSession {
  savedAt: string;
  cookies: StoredCookie[];
}

function isFlyCookie(domain: string): boolean {
  const bare = domain.replace(/^\./, '');
  return bare === 'fly.io' || bare.endsWith('.fly.io');
}

/**
 * The cookies worth carrying across a restart, stamped so a browser will keep
 * them.
 *
 * Two filters, each load-bearing. Only `fly.io` cookies, because the profile is
 * also full of analytics and payment-widget cookies that are persistent already
 * and carry a visitor identity we have no reason to copy to disk. And only the
 * ones with no expiry, because those are precisely the session cookies Chrome
 * drops on close — a cookie that already survives needs no help from us, and
 * re-stamping it would push its lifetime past what the issuer chose.
 */
export function selectSessionCookies(
  cookies: readonly StoredCookie[],
  expires: number,
): StoredCookie[] {
  return cookies
    .filter((cookie) => isFlyCookie(cookie.domain) && cookie.expires <= 0)
    .map((cookie) => ({ ...cookie, expires }));
}

export async function saveFlySession(context: BrowserContext): Promise<number> {
  const expires = Math.floor(
    Date.now() / 1000 + RESTORED_COOKIE_TTL_DAYS * 24 * 60 * 60,
  );
  const cookies = selectSessionCookies(await context.cookies(), expires);
  // Nothing to save is not the same as an empty session: Fly may simply not
  // have re-issued this time, and the file already on disk is still the best
  // thing we have. Writing an empty one would throw away a working session.
  if (cookies.length === 0) {
    return 0;
  }

  const stored: StoredSession = {
    savedAt: new Date().toISOString(),
    cookies,
  };

  mkdirSync(dirname(SESSION_FILE), { recursive: true, mode: 0o700 });
  const temporary = `${SESSION_FILE}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(stored, null, 2), { mode: 0o600 });
  renameSync(temporary, SESSION_FILE);
  return stored.cookies.length;
}

/** Returns how many cookies were restored; zero means "no saved session". */
export async function restoreFlySession(
  context: BrowserContext,
): Promise<number> {
  let stored: StoredSession;
  try {
    stored = JSON.parse(readFileSync(SESSION_FILE, 'utf8')) as StoredSession;
  } catch {
    // No file, or one written by an older shape. Either way there is nothing to
    // restore and the caller's sign-in path is the remedy.
    return 0;
  }
  if (!Array.isArray(stored.cookies) || stored.cookies.length === 0) {
    return 0;
  }
  await context.addCookies(stored.cookies);
  return stored.cookies.length;
}
