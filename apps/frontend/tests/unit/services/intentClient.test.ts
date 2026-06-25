import {
  getBridgeStatus,
  getPublicClient,
} from '@zapengine/app-core/services/intentClient';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const publicClientStub = { id: 'public-client-stub' };
  return {
    // intentClient.ts builds its publicClients map at import time, so the
    // implementation must be in place before the hoisted import runs.
    createPublicClient: vi.fn(() => publicClientStub),
    http: vi.fn(() => 'transport'),
    publicClientStub,
  };
});

vi.mock('@zapengine/intent-engine', () => ({
  createIntentEngine: vi.fn(() => ({})),
}));

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    createPublicClient: mocks.createPublicClient,
    http: mocks.http,
  };
});

describe('intentClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('getPublicClient', () => {
    it('returns a configured client for Ethereum, Arbitrum, and Base', () => {
      expect(getPublicClient(1)).toBe(mocks.publicClientStub);
      expect(getPublicClient(42161)).toBe(mocks.publicClientStub);
      expect(getPublicClient(8453)).toBe(mocks.publicClientStub);
    });

    it('throws for an unconfigured chain id', () => {
      expect(() => getPublicClient(999999)).toThrow(
        'No public client configured for chain 999999',
      );
    });
  });

  describe('getBridgeStatus', () => {
    it('builds the LI.FI status query and returns the parsed body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'DONE', substatus: 'COMPLETED' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const status = await getBridgeStatus({
        txHash: '0xabc',
        fromChain: 8453,
        toChain: 42161,
      });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('https://li.quest/v1/status?');
      expect(calledUrl).toContain('txHash=0xabc');
      expect(calledUrl).toContain('fromChain=8453');
      expect(calledUrl).toContain('toChain=42161');
      expect(status).toEqual({ status: 'DONE', substatus: 'COMPLETED' });
    });

    it('throws when LI.FI responds with a non-ok status', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, status: 502 }),
      );

      await expect(
        getBridgeStatus({ txHash: '0xabc', fromChain: 8453, toChain: 1 }),
      ).rejects.toThrow('Failed to fetch LI.FI bridge status: 502');
    });
  });
});
