/**
 * Pure model for sharing a portfolio bundle. Two concerns live here so they
 * can be unit-tested without a browser or React:
 *
 * 1. Building the shareable link (`<origin>/home?userId=<uuid>`).
 * 2. Deciding whether the web address bar should carry the logged-in user's
 *    own `?userId=` so copying the URL is enough to share — without ever
 *    clobbering a visited user's param (see `resolveOwnBundleUrlSearch`).
 *
 * The bundle view already reads `?userId=` (see `bundleViewModel.ts`); this
 * model only produces links and next-URL decisions, never reads live state.
 */

/** Production web origin, mirrored from apps/landing-page `src/config/links.ts`. */
export const DEFAULT_APP_WEB_ORIGIN = 'https://v2.zap-pilot.org';

/** Routes that render a portfolio and may carry the shareable `?userId=`. */
export const BUNDLE_SHARE_PATHS = ['/home', '/portfolio'] as const;

export function isBundleSharePath(pathname: string): boolean {
  const normalized =
    pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  return (BUNDLE_SHARE_PATHS as readonly string[]).includes(normalized);
}

/**
 * Resolve the origin used to build share links. Web passes
 * `window.location.origin`; native has no window and falls back to the
 * production origin so shared links always point at the real web app.
 */
export function resolveShareOrigin(
  locationOrigin: string | null | undefined,
): string {
  const trimmed = locationOrigin?.trim().replace(/\/$/, '');
  return trimmed ? trimmed : DEFAULT_APP_WEB_ORIGIN;
}

/** Build the canonical share link for a bundle: `<origin>/home?userId=<uuid>`. */
export function buildBundleShareUrl(origin: string, userId: string): string {
  const url = new URL(`${resolveShareOrigin(origin)}/home`);
  url.searchParams.set('userId', userId);
  return url.toString();
}

function toSearchParams(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
}

/**
 * Decide the next URL search string for the web address-bar sync.
 *
 * Returns `null` when the URL must not change; otherwise the next search
 * string WITHOUT a leading `?` (an empty string means "clear the query").
 *
 * Rules (in order):
 * - Non-portfolio route → never touch the URL.
 * - A visited bundle's param is present (latched id differs from the own id)
 *   → never touch it; the visited view must win. This also covers the window
 *   after reloading an own-link, before account-engine resolves `ownUserId`.
 * - Logged in → ensure `?userId=<ownUserId>` is present, preserving unrelated
 *   params; idempotent (returns `null` when already canonical) so the caller
 *   never writes on every render.
 * - Logged out with no latched param but our own param still in the URL
 *   (e.g. logout after the sync wrote it) → strip it.
 */
export function resolveOwnBundleUrlSearch(input: {
  pathname: string;
  search: string;
  latchedUrlUserId: string | null;
  ownUserId: string | null;
}): string | null {
  const { pathname, search, latchedUrlUserId, ownUserId } = input;

  if (!isBundleSharePath(pathname)) {
    return null;
  }

  // A visited bundle's param always wins — never overwrite it with the
  // viewer's own id. `latchedUrlUserId === ownUserId` is the own-link case and
  // falls through to the write path below.
  if (latchedUrlUserId !== null && latchedUrlUserId !== ownUserId) {
    return null;
  }

  const params = toSearchParams(search);
  const currentNormalized = params.toString();

  if (ownUserId !== null) {
    params.set('userId', ownUserId);
    const nextNormalized = params.toString();
    return nextNormalized === currentNormalized ? null : nextNormalized;
  }

  // Logged out (ownUserId === null) and no visited latch: clean up a param we
  // previously wrote for this now-signed-out user.
  if (params.has('userId')) {
    params.delete('userId');
    return params.toString();
  }

  return null;
}
