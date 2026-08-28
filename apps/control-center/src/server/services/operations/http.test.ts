import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { fetchReturning } from './adapter-testing.js';
import { fetchJson } from './http.js';

const ROWS_URL = 'https://provider.test/api/rows';
const LABEL = 'Provider rows request';
const rowsSchema = z.object({ rows: z.coerce.number() });

function read(input: {
  fetchImpl: typeof fetch;
  headers?: Record<string, string>;
  body?: unknown;
}): Promise<z.infer<typeof rowsSchema>> {
  return fetchJson({
    label: LABEL,
    url: ROWS_URL,
    token: 'provider-token',
    schema: rowsSchema,
    ...input,
  });
}

describe('fetchJson', () => {
  it('reads with the bearer credential and returns the parsed body', async () => {
    const fetchImpl = fetchReturning({ rows: '3' });

    // Coerced, so the caller gets what its schema promised rather than the
    // string the provider happened to serialise.
    await expect(read({ fetchImpl })).resolves.toEqual({ rows: 3 });
    expect(fetchImpl).toHaveBeenCalledWith(
      ROWS_URL,
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer provider-token' },
      }),
    );
  });

  it('gives every read a deadline', async () => {
    const fetchImpl = fetchReturning({ rows: 1 });

    await read({ fetchImpl });

    const signal = fetchImpl.mock.calls[0]?.[1]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
  });

  it('keeps caller headers alongside the credential', async () => {
    const fetchImpl = fetchReturning({ rows: 1 });

    await read({ fetchImpl, headers: { Accept: 'application/vnd.test+json' } });

    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toEqual({
      Authorization: 'Bearer provider-token',
      Accept: 'application/vnd.test+json',
    });
  });

  it('turns a body into a JSON POST', async () => {
    const fetchImpl = fetchReturning({ rows: 1 });

    await read({ fetchImpl, body: { query: 'count' } });

    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      Authorization: 'Bearer provider-token',
      'Content-Type': 'application/json',
    });
    expect(init?.body).toBe('{"query":"count"}');
  });

  it('names the request and the status on a non-2xx', async () => {
    const fetchImpl = fetchReturning({ detail: 'forbidden' }, 403);

    await expect(read({ fetchImpl })).rejects.toThrow(
      'Provider rows request failed (403)',
    );
  });

  it('never lets a non-2xx read as an empty result', async () => {
    // The failure this guards: an expired token answered with `[]` would be
    // published as "nothing to report", which is a green dashboard built out
    // of a broken integration.
    const fetchImpl = fetchReturning([], 401);

    await expect(read({ fetchImpl })).rejects.toThrow('failed (401)');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects a 2xx body the schema does not recognise', async () => {
    const fetchImpl = fetchReturning({ unexpected: true });

    await expect(read({ fetchImpl })).rejects.toThrow(
      'Provider rows request returned an unrecognised body',
    );
  });

  it('rejects a body that is not JSON at all', async () => {
    // A proxy or login wall answering 200 with HTML, which parses as neither
    // an error status nor a document any schema can describe.
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response('<html>gateway</html>', { status: 200 }),
    );

    await expect(read({ fetchImpl })).rejects.toThrow(SyntaxError);
  });
});
