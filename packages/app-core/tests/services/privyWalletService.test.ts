import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  parsePrepare: vi.fn((value: unknown) => ({ kind: 'prepare', value })),
  parseConfirm: vi.fn((value: unknown) => ({ kind: 'confirm', value })),
}));

vi.mock('@core/lib/http', () => ({
  httpUtils: {
    accountApi: {
      post: mocks.post,
    },
  },
}));

vi.mock('@zapengine/types/api', () => ({
  PrivyPrepareSendCallsResponseSchema: { parse: mocks.parsePrepare },
  PrivyConfirmSendCallsResponseSchema: { parse: mocks.parseConfirm },
}));

import {
  preparePrivyAtomicBatch,
  sendPrivyAtomicBatch,
} from '@core/services/privyWalletService';

const REQUEST_CONFIG = {
  timeout: 60_000,
  retries: 0,
  headers: { Authorization: 'Bearer access-token' },
};

describe('privyWalletService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.post.mockResolvedValue({ wire: true });
  });

  it('prepares a Privy atomic batch with authorization and validates the response', async () => {
    const request = { walletId: 'wallet-1' } as never;

    await expect(
      preparePrivyAtomicBatch(request, 'access-token'),
    ).resolves.toEqual({ kind: 'prepare', value: { wire: true } });

    expect(mocks.post).toHaveBeenCalledWith(
      '/wallet-execution/privy/prepare-send-calls',
      request,
      REQUEST_CONFIG,
    );
    expect(mocks.parsePrepare).toHaveBeenCalledWith({ wire: true });
  });

  it('confirms a Privy atomic batch with authorization and validates the response', async () => {
    const request = { previewId: 'preview-1' } as never;

    await expect(
      sendPrivyAtomicBatch(request, 'access-token'),
    ).resolves.toEqual({
      kind: 'confirm',
      value: { wire: true },
    });

    expect(mocks.post).toHaveBeenCalledWith(
      '/wallet-execution/privy/confirm-send-calls',
      request,
      REQUEST_CONFIG,
    );
    expect(mocks.parseConfirm).toHaveBeenCalledWith({ wire: true });
  });
});
