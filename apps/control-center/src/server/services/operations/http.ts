import type { z } from 'zod';

/**
 * Every adapter is aggregated behind one dashboard request, so a provider that
 * accepts the connection and then stops answering must not hold the page open.
 * `fetch` has no deadline of its own, which is why this is a constant here
 * rather than an option: an adapter that could leave it out eventually would,
 * and one hung vendor would stall the whole status page instead of degrading
 * the single domain that vendor feeds.
 */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * The one place these adapters read a provider API.
 *
 * A non-2xx throws rather than resolving to an empty result, and that is the
 * whole point of routing every read through here. Each caller turns "no rows"
 * into a healthy signal, so an expired token answered with an empty list would
 * be published as "no unresolved issues" — an error-tracking integration
 * reporting green because it is broken is the most expensive lie this
 * dashboard can tell. The throw lands in `collectOrFail` and becomes a
 * degraded reading, which is the honest answer: nothing was learned.
 *
 * A body that does not match the schema is thrown the same way, with a
 * sentence instead of zod's own message — that message is the entire failing
 * document, and an operator reading a wall of JSON learns less than one who is
 * told which integration stopped making sense.
 */
export async function fetchJson<T>(input: {
  /** How a failure reads on the dashboard, e.g. `Sentry issues request`. */
  label: string;
  url: string;
  /** Bearer credential. Required: none of these APIs are read anonymously. */
  token: string;
  schema: z.ZodType<T>;
  fetchImpl: typeof fetch;
  headers?: Record<string, string>;
  /** Present sends a POST carrying this as JSON; absent sends a GET. */
  body?: unknown;
}): Promise<T> {
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

  const parsed = input.schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(`${input.label} returned an unrecognised body`);
  }
  return parsed.data;
}
