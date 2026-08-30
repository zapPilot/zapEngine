import { ServiceLayerException } from '../../../../src/common/exceptions';
import {
  isRetryableTimeoutError,
  retryOnceOnTimeout,
} from '../../../../src/common/utils/retry.util';

describe('retryOnceOnTimeout', () => {
  it('retries one timeout and returns the second result', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('request timed out'))
      .mockResolvedValueOnce('ok');
    const onRetry = vi.fn();

    await expect(retryOnceOnTimeout(operation, onRetry)).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('does not retry a non-timeout error', async () => {
    const error = new Error('ECONNREFUSED');
    const operation = vi.fn().mockRejectedValue(error);

    await expect(retryOnceOnTimeout(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledOnce();
  });

  it('returns the second timeout without a third attempt', async () => {
    const error = new Error('timeout');
    const operation = vi.fn().mockRejectedValue(error);

    await expect(retryOnceOnTimeout(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(2);
  });
});

describe('isRetryableTimeoutError', () => {
  it('does not retry an already-mapped service error', () => {
    expect(
      isRetryableTimeoutError(new ServiceLayerException('upstream timeout')),
    ).toBe(false);
  });
});
