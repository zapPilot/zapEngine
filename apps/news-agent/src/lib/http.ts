export function createHttp(fetcher: typeof fetch = fetch) {
  async function request(
    url: string,
    headers: Record<string, string>,
    body?: unknown,
    timeout = 30_000,
  ): Promise<unknown> {
    const response = await fetcher(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(Math.min(timeout, 90_000)),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
  return {
    getJson: (url: string, headers: Record<string, string> = {}) =>
      request(url, headers),
    postJson: (
      url: string,
      body: unknown,
      headers: Record<string, string> = {},
      timeout?: number,
    ) => request(url, headers, body, timeout),
  };
}
