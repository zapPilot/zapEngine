import {
  BridgeFailedError,
  waitForBridgeCompletion,
} from '@core/services/intentClient';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TX_HASH =
  '0xabc0000000000000000000000000000000000000000000000000000000000001';

function statusResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 429,
    json: async () => body,
  } as Response;
}

describe('waitForBridgeCompletion', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('polls through PENDING/NOT_FOUND and resolves on DONE', async () => {
    fetchMock
      .mockResolvedValueOnce(statusResponse({ status: 'NOT_FOUND' }))
      .mockResolvedValueOnce(statusResponse({ status: 'PENDING' }))
      .mockResolvedValueOnce(
        statusResponse({
          status: 'DONE',
          receiving: { txHash: '0xdest', chainId: 1337 },
        }),
      );
    const seen: string[] = [];

    const promise = waitForBridgeCompletion({
      txHash: TX_HASH,
      fromChain: 8453,
      toChain: 1337,
      onStatus: (status) => seen.push(status.status),
    });

    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(promise).resolves.toEqual({
      status: 'DONE',
      receiving: { txHash: '0xdest', chainId: 1337 },
    });
    expect(seen).toEqual(['NOT_FOUND', 'PENDING', 'DONE']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`txHash=${TX_HASH}`);
  });

  it('throws BridgeFailedError with the LI.FI scan link on FAILED', async () => {
    fetchMock.mockResolvedValueOnce(
      statusResponse({ status: 'FAILED', substatus: 'SLIPPAGE_EXCEEDED' }),
    );

    await expect(
      waitForBridgeCompletion({
        txHash: TX_HASH,
        fromChain: 8453,
        toChain: 1,
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof BridgeFailedError &&
        error.substatus === 'SLIPPAGE_EXCEEDED' &&
        error.lifiScanUrl === `https://scan.li.fi/tx/${TX_HASH}` &&
        error.message.includes('FAILED'),
    );
  });

  it('treats HTTP failures as transient and keeps polling', async () => {
    fetchMock
      .mockResolvedValueOnce(statusResponse(null, false))
      .mockResolvedValueOnce(statusResponse({ status: 'DONE' }));

    const promise = waitForBridgeCompletion({
      txHash: TX_HASH,
      fromChain: 8453,
      toChain: 42161,
    });

    // Error path backs off (5s * 1.5 = 7.5s).
    await vi.advanceTimersByTimeAsync(7_500);

    await expect(promise).resolves.toEqual({ status: 'DONE' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops polling when the abort signal fires', async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValue(statusResponse({ status: 'PENDING' }));

    const promise = waitForBridgeCompletion({
      txHash: TX_HASH,
      fromChain: 8453,
      toChain: 1,
      signal: controller.signal,
    });
    const assertion = expect(promise).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof DOMException && error.name === 'AbortError',
    );

    await vi.advanceTimersByTimeAsync(1_000);
    controller.abort();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
