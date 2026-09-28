import { describe, expect, it, vi } from 'vitest';

import { createRetryingSupabaseFetch } from './supabase-client.js';

describe('createRetryingSupabaseFetch coverage', () => {
  it('invokes the body-cancel rejection handler before retrying a status', async () => {
    const cancel = vi.fn().mockRejectedValue(new Error('cancel failed'));
    const statusFetcher = vi
      .fn()
      .mockResolvedValueOnce({ status: 503, body: { cancel } })
      .mockResolvedValueOnce({ status: 200 });
    const sleep = vi.fn().mockResolvedValue(undefined);

    const response = await createRetryingSupabaseFetch(
      statusFetcher as typeof fetch,
      sleep,
    )('https://example.test/rest/v1/episodes');
    expect(response.status).toBe(200);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(250);
  });
});
