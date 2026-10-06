import { z } from 'zod';
import { fetchJson, fetchText, HttpStatusError } from './http.js';
export const REPO = 'zapPilot/zapEngine';
export const API = `https://api.github.com/repos/${REPO}`;
export async function githubJson<T>(input: {
  token: string;
  fetchImpl: typeof fetch;
  label: string;
  path: string;
  schema: z.ZodType<T>;
}): Promise<T> {
  return fetchJson({
    label: input.label,
    url: `${API}/${input.path}`,
    token: input.token,
    schema: input.schema,
    fetchImpl: input.fetchImpl,
    headers: githubHeaders(),
  });
}

export async function githubText(input: {
  token: string;
  fetchImpl: typeof fetch;
  label: string;
  path: string;
}): Promise<string> {
  return fetchText({
    label: input.label,
    url: `${API}/${input.path}`,
    token: input.token,
    fetchImpl: input.fetchImpl,
    headers: githubHeaders(),
  });
}

export function githubHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'zapengine-control-center',
  };
}

export async function githubPages<T>(input: {
  token: string;
  fetchImpl: typeof fetch;
  path: string;
  schema: z.ZodType<T>;
  label: string;
}): Promise<{ rows: T[]; truncated: boolean }> {
  let url: string | null = `${API}/${input.path}`;
  const rows: T[] = [];
  for (let page = 0; page < 2 && url; page += 1) {
    let next: string | null = null;
    rows.push(
      ...(await fetchJson({
        ...input,
        url,
        schema: z.array(input.schema),
        headers: githubHeaders(),
        onResponseHeaders(headers) {
          next =
            headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
          if (next) {
            const nextUrl = new URL(next);
            if (nextUrl.origin !== 'https://api.github.com') {
              throw new Error('GitHub pagination returned an external origin');
            }
            if (input.path.startsWith('secret-scanning/')) {
              nextUrl.searchParams.set('hide_secret', 'true');
              next = nextUrl.href;
            }
          }
        },
      })),
    );
    url = next;
  }
  return { rows, truncated: url !== null };
}

export function githubAccessUnavailable(error: unknown): boolean {
  return (
    error instanceof HttpStatusError &&
    (error.status === 404 ||
      (error.status === 403 &&
        error.headers.get('x-ratelimit-remaining') !== '0' &&
        !error.headers.has('retry-after')))
  );
}
