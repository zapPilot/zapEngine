import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APIError, NetworkError } from '@/lib/http/errors';
import { httpRequest } from '@/lib/http/request';

const {
  mockCreateTimeoutController,
  mockIsAbortError,
  mockHasHeaders,
  mockParseCacheControlForHint,
  mockSyncQueryCacheDefaultsFromHint,
  mockShouldAttemptRetry,
  mockCalculateBackoffDelay,
  mockDelay,
  mockFetch,
} = vi.hoisted(() => ({
  mockCreateTimeoutController: vi.fn(),
  mockIsAbortError: vi.fn(),
  mockHasHeaders: vi.fn(),
  mockParseCacheControlForHint: vi.fn(),
  mockSyncQueryCacheDefaultsFromHint: vi.fn(),
  mockShouldAttemptRetry: vi.fn(),
  mockCalculateBackoffDelay: vi.fn(),
  mockDelay: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.stubGlobal('fetch', mockFetch);

vi.mock('@/lib/http/abort-control', () => ({
  createTimeoutController: mockCreateTimeoutController,
  isAbortError: mockIsAbortError,
}));

vi.mock('@/lib/http/cache-control', () => ({
  hasHeaders: mockHasHeaders,
  parseCacheControlForHint: mockParseCacheControlForHint,
  syncQueryCacheDefaultsFromHint: mockSyncQueryCacheDefaultsFromHint,
}));

vi.mock('@/lib/http/retry', () => ({
  shouldAttemptRetry: mockShouldAttemptRetry,
  calculateBackoffDelay: mockCalculateBackoffDelay,
  delay: mockDelay,
}));

function createMockResponse(data: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(data),
    headers: { get: vi.fn() },
  };
}

describe('httpRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTimeoutController.mockReturnValue({
      signal: new AbortController().signal,
      cleanup: vi.fn(),
    });
    mockIsAbortError.mockReturnValue(false);
    mockHasHeaders.mockReturnValue(false);
    mockParseCacheControlForHint.mockReturnValue(null);
    mockShouldAttemptRetry.mockReturnValue(false);
    mockCalculateBackoffDelay.mockReturnValue(0);
    mockDelay.mockResolvedValue(undefined);
  });

  it('makes GET request and returns data', async () => {
    const mockData = { id: 1, name: 'test' };
    const mockResponse = createMockResponse(mockData);
    mockFetch.mockResolvedValue(mockResponse);

    const result = await httpRequest('https://api.example.com/data');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/data',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(result).toEqual(mockData);
  });

  it('applies transformer to response data', async () => {
    const mockData = { value: 10 };
    const mockResponse = createMockResponse(mockData);
    mockFetch.mockResolvedValue(mockResponse);

    const transformer = (data: { value: number }) => ({
      doubled: data.value * 2,
    });
    const result = await httpRequest(
      'https://api.example.com/data',
      {},
      transformer,
    );

    expect(result).toEqual({ doubled: 20 });
  });

  it('returns data without transformer', async () => {
    const mockData = { raw: 'data', nested: { value: 42 } };
    const mockResponse = createMockResponse(mockData);
    mockFetch.mockResolvedValue(mockResponse);

    const result = await httpRequest('https://api.example.com/data');

    expect(result).toEqual(mockData);
  });

  it('sets body for POST request', async () => {
    const mockData = { success: true };
    const mockResponse = createMockResponse(mockData);
    mockFetch.mockResolvedValue(mockResponse);

    const requestBody = { name: 'test', value: 123 };
    await httpRequest('https://api.example.com/data', {
      method: 'POST',
      body: requestBody,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/data',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(requestBody),
      }),
    );
  });

  it('does not set body for GET even with body in config', async () => {
    const mockData = { result: 'data' };
    const mockResponse = createMockResponse(mockData);
    mockFetch.mockResolvedValue(mockResponse);

    await httpRequest('https://api.example.com/data', {
      method: 'GET',
      body: { ignored: 'value' },
    });

    const fetchCall = mockFetch.mock.calls[0];
    const requestInit = fetchCall[1] as RequestInit;

    expect(requestInit.body).toBeUndefined();
  });

  it('throws APIError for non-ok response', async () => {
    const mockResponse = createMockResponse({ error: 'Not found' }, false, 404);
    mockFetch.mockResolvedValue(mockResponse);

    await expect(httpRequest('https://api.example.com/data')).rejects.toThrow(
      APIError,
    );
  });

  it('calls parseCacheControlForHint when hasHeaders returns true', async () => {
    const mockData = { data: 'test' };
    const mockResponse = createMockResponse(mockData);
    const mockHeaderGet = vi.fn().mockReturnValue('max-age=3600');
    mockResponse.headers.get = mockHeaderGet;
    mockFetch.mockResolvedValue(mockResponse);

    mockHasHeaders.mockReturnValue(true);
    mockParseCacheControlForHint.mockReturnValue(null);

    await httpRequest('https://api.example.com/data');

    expect(mockHasHeaders).toHaveBeenCalledWith(mockResponse);
    expect(mockParseCacheControlForHint).toHaveBeenCalledWith('max-age=3600');
  });

  it('calls syncQueryCacheDefaultsFromHint when cacheHint is truthy', async () => {
    const mockData = { data: 'test' };
    const mockResponse = createMockResponse(mockData);
    mockFetch.mockResolvedValue(mockResponse);

    mockHasHeaders.mockReturnValue(true);
    const mockCacheHint = { maxAge: 3600 };
    mockParseCacheControlForHint.mockReturnValue(mockCacheHint);

    await httpRequest('https://api.example.com/data');

    expect(mockSyncQueryCacheDefaultsFromHint).toHaveBeenCalledWith(
      mockCacheHint,
    );
  });

  it('does not call syncQueryCacheDefaultsFromHint when cacheHint is null', async () => {
    const mockData = { data: 'test' };
    const mockResponse = createMockResponse(mockData);
    mockFetch.mockResolvedValue(mockResponse);

    mockHasHeaders.mockReturnValue(true);
    mockParseCacheControlForHint.mockReturnValue(null);

    await httpRequest('https://api.example.com/data');

    expect(mockSyncQueryCacheDefaultsFromHint).not.toHaveBeenCalled();
  });

  it('throws NetworkError after all retries fail', async () => {
    const networkError = new Error('Network failure');
    mockFetch.mockRejectedValue(networkError);
    mockIsAbortError.mockReturnValue(false);
    mockShouldAttemptRetry
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    mockCalculateBackoffDelay.mockReturnValue(10);

    await expect(
      httpRequest('https://api.example.com/data', { retries: 2 }),
    ).rejects.toThrow(NetworkError);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockDelay).toHaveBeenCalledTimes(2);
  });

  it('re-throws APIError directly without wrapping in NetworkError', async () => {
    const apiError = new APIError('Forbidden', 403, 'FORBIDDEN');
    mockFetch.mockRejectedValue(apiError);
    mockIsAbortError.mockReturnValue(false);

    await expect(
      httpRequest('https://api.example.com/data', { retries: 0 }),
    ).rejects.toThrow(APIError);
    await expect(
      httpRequest('https://api.example.com/data', { retries: 0 }),
    ).rejects.toThrow('Forbidden');
  });

  it('throws TimeoutError when isAbortError returns true', async () => {
    const { TimeoutError } = await import('@/lib/http/errors');
    const abortError = new DOMException('aborted', 'AbortError');
    mockFetch.mockRejectedValue(abortError);
    mockIsAbortError.mockReturnValue(true);

    await expect(
      httpRequest('https://api.example.com/data', { retries: 0 }),
    ).rejects.toThrow(TimeoutError);
  });

  it('throws NetworkError with fallback message when retries is negative (loop never runs)', async () => {
    // Exercises the `lastError ? lastError.message : "Network request failed"` false branch.
    // With retries: -1, the for-loop condition (0 <= -1) is false from the start,
    // so the catch block never runs and lastError stays undefined.
    await expect(
      httpRequest('https://api.example.com/data', { retries: -1 }),
    ).rejects.toThrow('Network request failed');

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
