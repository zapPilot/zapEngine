const DESKTOP_USER_ID_QUERY_PARAM = 'userId';

/**
 * Desktop POC: read existing bundle analytics by a URL-provided user id.
 *
 * Privy embedded wallets can belong to a new account-engine user, while the
 * current dashboard data can live under a historical bundle user id. Keep this
 * override in one place so the onboarding migration can replace it cleanly.
 */
export function resolveDesktopUserId(
  accountUserId: string | null,
  urlUserId: string | null,
): string | null {
  const resolvedUrlUserId = urlUserId?.trim();
  if (resolvedUrlUserId) {
    return resolvedUrlUserId;
  }

  const resolvedAccountUserId = accountUserId?.trim();
  return resolvedAccountUserId || null;
}

function userIdFromSearch(search: string): string | null {
  if (!search) {
    return null;
  }

  const value = new URLSearchParams(search).get(DESKTOP_USER_ID_QUERY_PARAM);
  const resolved = value?.trim();
  return resolved || null;
}

function searchFromHash(hash: string): string {
  const questionMarkIndex = hash.indexOf('?');
  if (questionMarkIndex === -1) {
    return '';
  }
  return hash.slice(questionMarkIndex);
}

export function getDesktopUserIdOverrideFromUrl(
  documentSearch: string,
  routerSearch: string,
  hash: string,
): string | null {
  return (
    userIdFromSearch(documentSearch) ||
    userIdFromSearch(routerSearch) ||
    userIdFromSearch(searchFromHash(hash))
  );
}
