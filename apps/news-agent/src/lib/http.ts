type Method = 'GET' | 'POST';

// Upstream bodies can echo request data, so only a short JSON `message` field is surfaced.
async function failure(response: Response): Promise<Error> {
  let detail = '';
  try {
    const body: unknown = await response.json();
    if (
      body &&
      typeof body === 'object' &&
      'message' in body &&
      typeof body.message === 'string'
    )
      detail = `: ${body.message.slice(0, 200)}`;
  } catch {
    // Non-JSON error bodies are dropped.
  }
  return new Error(`HTTP ${response.status}${detail}`);
}

export function createHttp(fetcher: typeof fetch = fetch) {
  async function request(
    method: Method,
    url: string,
    headers: Record<string, string>,
    body?: unknown,
    timeout = 30_000,
  ): Promise<unknown> {
    const response = await fetcher(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(Math.min(timeout, 90_000)),
      redirect: 'error',
    });
    if (!response.ok) throw await failure(response);
    return response.json();
  }
  return {
    getJson: (url: string, headers: Record<string, string> = {}) =>
      request('GET', url, headers),
    postJson: (
      url: string,
      body: unknown,
      headers: Record<string, string> = {},
      timeout?: number,
    ) => request('POST', url, headers, body, timeout),
  };
}
export type Http = ReturnType<typeof createHttp>;
