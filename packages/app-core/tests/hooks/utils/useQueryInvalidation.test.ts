import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
}));

vi.mock('@core/utils', () => ({
  walletLogger: { error: mocks.error },
}));

import { invalidateAndRefetch } from '@core/hooks/utils/useQueryInvalidation';

describe('invalidateAndRefetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invalidates then refetches', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const refetch = vi.fn().mockResolvedValue(undefined);

    await invalidateAndRefetch({
      queryClient: { invalidateQueries } as never,
      queryKey: ['wallets', 'user-1'],
      refetch,
      operationName: 'wallet update',
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['wallets', 'user-1'],
    });
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(invalidateQueries.mock.invocationCallOrder[0]).toBeLessThan(
      refetch.mock.invocationCallOrder[0]!,
    );
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('logs invalidation failure but still refetches', async () => {
    const failure = new Error('invalidate failed');
    const invalidateQueries = vi.fn().mockRejectedValue(failure);
    const refetch = vi.fn().mockResolvedValue(undefined);

    await invalidateAndRefetch({
      queryClient: { invalidateQueries } as never,
      queryKey: ['wallets'],
      refetch,
    });

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(mocks.error).toHaveBeenCalledWith(
      'Failed to invalidate queries after operation',
      failure,
    );
  });

  it('logs refetch failure without throwing', async () => {
    const failure = new Error('refetch failed');
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const refetch = vi.fn().mockRejectedValue(failure);

    await expect(
      invalidateAndRefetch({
        queryClient: { invalidateQueries } as never,
        queryKey: ['wallets'],
        refetch,
        operationName: 'delete wallet',
      }),
    ).resolves.toBeUndefined();

    expect(mocks.error).toHaveBeenCalledWith(
      'Failed to refetch data after delete wallet',
      failure,
    );
  });

  it('logs both failures independently', async () => {
    const invalidateError = new Error('invalidate');
    const refetchError = new Error('refetch');

    await invalidateAndRefetch({
      queryClient: {
        invalidateQueries: vi.fn().mockRejectedValue(invalidateError),
      } as never,
      queryKey: ['wallets'],
      refetch: vi.fn().mockRejectedValue(refetchError),
      operationName: 'sync',
    });

    expect(mocks.error).toHaveBeenNthCalledWith(
      1,
      'Failed to invalidate queries after sync',
      invalidateError,
    );
    expect(mocks.error).toHaveBeenNthCalledWith(
      2,
      'Failed to refetch data after sync',
      refetchError,
    );
  });
});
