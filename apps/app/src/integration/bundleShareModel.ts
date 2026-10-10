/**
 * Pure model for sharing a portfolio bundle. Two concerns live here so they
 * can be unit-tested without a browser or React:
 *
 * 1. Building the shareable link (`<origin>/today?userId=<uuid>`).
 * 2. Keeping the web address bar in sync with the displayed bundle.
 *
 * The bundle view already reads `?userId=` (see `bundleViewModel.ts`); this
 * model only produces links and next-URL decisions, never reads live state.
 */

/** Production web origin, mirrored from apps/landing-page `src/config/links.ts`. */
export const DEFAULT_APP_WEB_ORIGIN = 'https://v2.zap-pilot.org';

/** Routes that render a portfolio and may carry the shareable `?userId=`. */
const BUNDLE_SHARE_PATHS = ['/today', '/portfolio', '/runtime'] as const;

export function isBundleSharePath(pathname: string): boolean {
  const normalized =
    pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  return (BUNDLE_SHARE_PATHS as readonly string[]).includes(normalized);
}

/**
 * Resolve the origin used to build share links. Web passes
 * the page origin; desktop and native fall back to the
 * production origin so shared links always point at the real web app.
 */
export function resolveShareOrigin(
  locationOrigin: string | null | undefined,
  runtime?: string,
): string {
  if (runtime === 'desktop') return DEFAULT_APP_WEB_ORIGIN;
  const trimmed = locationOrigin?.trim().replace(/\/$/, '');
  return trimmed ? trimmed : DEFAULT_APP_WEB_ORIGIN;
}

/** Build the canonical share link for a bundle: `<origin>/today?userId=<uuid>`. */
export function buildBundleShareUrl(origin: string, userId: string): string {
  const url = new URL(`${resolveShareOrigin(origin)}/today`);
  url.searchParams.set('userId', userId);
  return url.toString();
}

/** Synchronize the address bar with the bundle currently being displayed. */
export function resolveBundleUrlSearch(input: {
  pathname: string;
  search: string;
  viewingUserId: string | null;
}): string | null {
  if (!isBundleSharePath(input.pathname)) return null;
  const params = new URLSearchParams(input.search);
  const current = params.toString();
  if (input.viewingUserId) params.set('userId', input.viewingUserId);
  else params.delete('userId');
  const next = params.toString();
  return next === current ? null : next;
}
