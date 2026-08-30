import type { z } from 'zod';

/**
 * Every adapter is aggregated behind one dashboard request, so a provider that
 * accepts the connection and then stops answering must not hold the page open.
 */
const REQUEST_TIMEOUT_MS = 10_000;

export async function fetchJson<T>(input: {
  label: string;
  url: string;
  token: string;
  schema: z.ZodType<T>;
  fetchImpl: typeof fetch;
  headers?: Record<string, string>;
  body?: unknown;
}): Promise<T> {
  const response = await authenticatedFetch({
    label: input.label,
    url: input.url,
    token: input.token,
    fetchImpl: input.fetchImpl,
    headers: input.headers,
    body: input.body,
  });

  const parsed = input.schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(`${input.label} returned an unrecognised body`);
  }
  return parsed.data;
}

/**
 * Raw-text sibling used only for bounded evidence such as GitHub job logs.
 * Callers must still trim/redact before returning text to an operator or MCP.
 */
export async function fetchText(input: {
  label: string;
  url: string;
  token: string;
  fetchImpl: typeof fetch;
  headers?: Record<string, string>;
}): Promise<string> {
  const response = await authenticatedFetch(input);
  return response.text();
}

async function authenticatedFetch(input: {
  label: string;
  url: string;
  token: string;
  fetchImpl: typeof fetch;
  headers?: Record<string, string>;
  body?: unknown;
}): Promise<Response> {
  const sendsBody = input.body !== undefined;
  const response = await input.fetchImpl(input.url, {
    method: sendsBody ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${input.token}`,
      ...(sendsBody ? { 'Content-Type': 'application/json' } : {}),
      ...input.headers,
    },
    ...(sendsBody ? { body: JSON.stringify(input.body) } : {}),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${input.label} failed (${response.status})`);
  }
  return response;
}
