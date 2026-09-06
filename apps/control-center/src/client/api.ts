/**
 * Every dashboard read goes through here so that a non-JSON answer is named
 * rather than parsed. Two real failures reach the browser as `200`s or as
 * bodies `response.ok` happily accepts:
 *
 * - The remote API answers `401` behind Basic Auth, and a browser only raises
 *   its native credential prompt for navigations -- never reliably for `fetch`.
 * - A stale SPA shell cached against an API path replays `200 text/html`
 *   indefinitely, because it was served with `Last-Modified` and no
 *   `Cache-Control` and so stays heuristically fresh for hours.
 *
 * Both used to surface as `Unexpected token '<'` from `JSON.parse`.
 */
async function readJson<T>(url: string, response: Response): Promise<T> {
  if (response.status === 401) {
    throw new Error(
      `Not signed in — open ${url} directly in a new tab to sign in, then reload`,
    );
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      `Expected JSON from ${url}, got ${contentType || 'no content-type'}`,
    );
  }
  return (await response.json()) as T;
}

export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    await readJson(url, response);
    throw new Error(`HTTP ${response.status}`);
  }
  return readJson<T>(url, response);
}

export async function sendJson<T>(
  url: string,
  method: 'POST' | 'PUT',
  body?: unknown,
): Promise<T | null> {
  const response = await fetch(url, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok) {
    // A rejected mutation names itself in the body; fall back to the helper's
    // reading of the response only when there is no such message.
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (payload?.error) {
      throw new Error(payload.error);
    }
    await readJson(url, response);
    throw new Error(`HTTP ${response.status}`);
  }
  return response.status === 204
    ? null
    : readJson<T>(url, response).catch(() => null);
}
