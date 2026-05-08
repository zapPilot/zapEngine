import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAsyncRetryButton } from '@/hooks/ui/useAsyncRetryButton';

describe('useAsyncRetryButton', () => {
  it('sets retrying while the retry promise is pending', async () => {
    let resolveRetry: (() => void) | undefined;
    const onRetry = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRetry = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useAsyncRetryButton({
        onRetry,
        errorContext: 'refresh balances',
      }),
    );

    act(() => {
      result.current.handleRetry();
    });

    expect(onRetry).toHaveBeenCalledOnce();
    expect(result.current.isRetrying).toBe(true);

    await act(async () => {
      resolveRetry?.();
    });

    await waitFor(() => expect(result.current.isRetrying).toBe(false));
  });

  it('logs retry failures and clears retrying state', async () => {
    const logger = { error: vi.fn() };
    const error = new Error('retry failed');
    const onRetry = vi.fn().mockRejectedValue(error);

    const { result } = renderHook(() =>
      useAsyncRetryButton({
        onRetry,
        errorContext: 'refresh balances',
        logger,
      }),
    );

    act(() => {
      result.current.handleRetry();
    });

    await waitFor(() => expect(result.current.isRetrying).toBe(false));
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to refresh balances',
      error,
    );
  });
});
