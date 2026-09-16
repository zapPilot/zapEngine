import { afterEach, describe, expect, it, vi } from 'vitest';

import { getJson } from './api.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('api content-type edge branches', () => {
  it('reports no content-type when the header is absent', async () => {
    const response = new Response('oops', { status: 200 });
    vi.spyOn(response.headers, 'get').mockReturnValue(null);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(getJson('/api/overview')).rejects.toThrow(
      'Expected JSON from /api/overview, got no content-type',
    );
  });

  it('reports an empty content-type as no content-type', async () => {
    const response = new Response('oops', { status: 200 });
    vi.spyOn(response.headers, 'get').mockReturnValue('');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(getJson('/api/pipeline/queues')).rejects.toThrow(
      /got no content-type/,
    );
  });
});
