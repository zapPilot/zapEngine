import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

vi.mock('@core/lib/http/config', () => ({
  API_ENDPOINTS: {
    analyticsEngine: 'https://analytics.example',
    accountApi: 'https://account.example',
  },
}));

vi.mock('@core/lib/http/methods', () => ({
  httpGet: mocks.get,
  httpPost: mocks.post,
  httpPut: mocks.put,
  httpDelete: mocks.del,
}));

import { httpUtils } from '@core/lib/http/serviceClients';

describe('serviceClients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue('get');
    mocks.post.mockResolvedValue('post');
    mocks.put.mockResolvedValue('put');
    mocks.del.mockResolvedValue('delete');
  });

  it('resolves the analytics base URL lazily for queries', async () => {
    await expect(
      httpUtils.analyticsEngine.get('/market', { timeout: 123 }),
    ).resolves.toBe('get');
    expect(mocks.get).toHaveBeenCalledWith('/market', {
      timeout: 123,
      baseURL: 'https://analytics.example',
    });
  });

  it('applies the account base URL to every mutation method', async () => {
    await expect(httpUtils.accountApi.post('/users', { id: 1 })).resolves.toBe(
      'post',
    );
    await expect(
      httpUtils.accountApi.put('/users/1', { id: 2 }, { retries: 0 }),
    ).resolves.toBe('put');
    await expect(
      httpUtils.accountApi.delete('/users/1', undefined, { timeout: 500 }),
    ).resolves.toBe('delete');

    expect(mocks.post).toHaveBeenCalledWith(
      '/users',
      { id: 1 },
      {
        baseURL: 'https://account.example',
      },
    );
    expect(mocks.put).toHaveBeenCalledWith(
      '/users/1',
      { id: 2 },
      {
        retries: 0,
        baseURL: 'https://account.example',
      },
    );
    expect(mocks.del).toHaveBeenCalledWith('/users/1', undefined, {
      timeout: 500,
      baseURL: 'https://account.example',
    });
  });
});
