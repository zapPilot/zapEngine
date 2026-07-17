/**
 * Pure model for the public bundle view: opening the web app with
 * `?userId=<account-engine uuid>` shows that bundle's portfolio read-only,
 * no login required. Analytics v2 paths are UUID-typed, so only a UUID is
 * accepted — a wallet address would 422 upstream.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseBundleViewUserId(
  search: string | null | undefined,
): string | null {
  if (!search) {
    return null;
  }
  const params = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search,
  );
  const candidate = params.get('userId')?.trim() ?? '';
  if (!UUID_PATTERN.test(candidate)) {
    return null;
  }
  return candidate.toLowerCase();
}

export interface ViewingState {
  /** Subject whose bundle the screens display: URL param or the logged-in user. */
  viewingUserId: string | null;
  /** False when displaying someone else's bundle — hide write affordances. */
  isOwnBundle: boolean;
  /** Connected and waiting on the backend user record; no URL override present. */
  isResolvingViewingUser: boolean;
  /** No subject at all — screens render DEMO data. */
  isDemo: boolean;
}

export function resolveViewingState(input: {
  urlUserId: string | null;
  ownUserId: string | null;
  isConnected: boolean;
  loadingUser: boolean;
}): ViewingState {
  const { urlUserId, ownUserId, isConnected, loadingUser } = input;
  const viewingUserId = urlUserId ?? ownUserId;
  const isOwnBundle =
    urlUserId === null || (ownUserId !== null && ownUserId === urlUserId);
  // A URL override renders immediately; only the own-bundle path has to wait
  // for account-engine to resolve who the connected wallet belongs to.
  const isResolvingViewingUser =
    urlUserId === null && isConnected && loadingUser && ownUserId === null;
  const isDemo = viewingUserId === null && !isResolvingViewingUser;

  return { viewingUserId, isOwnBundle, isResolvingViewingUser, isDemo };
}
