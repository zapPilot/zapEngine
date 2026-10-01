import { isPlainRecord as isRecord } from '../lib/typeGuards.js';

export function parseThreadsApiJson(raw: string): unknown {
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function describeThreadsApiError(
  status: number,
  body: unknown,
  rawFallback?: string,
): string {
  if (isRecord(body) && isRecord(body['error'])) {
    const message = body['error']['message'];
    if (nonemptyString(message)) {
      return `Threads API ${status}: ${message.trim()}`;
    }
  }
  return `Threads API ${status}: ${rawFallback?.trim() || 'request failed'}`;
}

export function nonemptyString(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}

// A published media ID is not a shortcode. Resolve the platform permalink
// once; failures must never turn an already-live post into a publish retry.
export async function readThreadsPermalink(input: {
  postId: string;
  accessToken: string;
  fetchImpl: typeof fetch;
  apiBaseUrl?: string;
  onLog?: (message: string) => void;
}): Promise<string | null> {
  try {
    const url = new URL(
      `/${encodeURIComponent(input.postId)}`,
      input.apiBaseUrl ?? 'https://graph.threads.net',
    );
    url.searchParams.set('fields', 'id,permalink');
    const response = await input.fetchImpl(url, {
      headers: { Authorization: `Bearer ${input.accessToken}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error('Permalink request failed');
    const body = parseThreadsApiJson(await response.text());
    if (!isRecord(body) || !nonemptyString(body['permalink'])) {
      throw new Error('Missing permalink');
    }
    const permalink = new URL(body['permalink'].trim());
    if (
      permalink.protocol !== 'https:' ||
      ![
        'threads.net',
        'www.threads.net',
        'threads.com',
        'www.threads.com',
      ].includes(permalink.hostname) ||
      !/^\/@[^/]+\/post\/[^/]+\/?$/.test(permalink.pathname) ||
      permalink.username ||
      permalink.password
    ) {
      throw new Error('Invalid permalink');
    }
    return permalink.href;
  } catch {
    input.onLog?.(
      '[threads] Post is live; permalink unavailable. Metrics collection can retry the lookup.',
    );
    return null;
  }
}
