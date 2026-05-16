import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildGmxV2Deposit,
  getBridgeStatus,
  getPublicClient,
} from '@/services/intentClient';

const mocks = vi.hoisted(() => {
  const publicClientStub = { id: 'public-client-stub' };
  return {
    buildGmxV2Supply: vi.fn(),
    // intentClient.ts builds its publicClients map at import time, so the
    // implementation must be in place before the hoisted import runs.
    createPublicClient: vi.fn(() => publicClientStub),
    http: vi.fn(() => 'transport'),
    publicClientStub,
  };
});

vi.mock('@zapengine/intent-engine', () => ({
  createIntentEngine: vi.fn(() => ({
    buildGmxV2Supply: mocks.buildGmxV2Supply,
  })),
  GMX_V2_TOKENS: {
    USDC: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
  },
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

  describe('buildGmxV2Deposit', () => {
    it('delegates to the intent engine with the USDC source token', async () => {
      const plan = { approvals: [], steps: [] };
      mocks.buildGmxV2Supply.mockResolvedValueOnce(plan);

      const result = await buildGmxV2Deposit({
        marketKey: 'eth-usdc',
        amount: '1000000',
        userAddress: '0x1111111111111111111111111111111111111111',
      });

      expect(mocks.buildGmxV2Supply).toHaveBeenCalledWith({
        marketKey: 'eth-usdc',
        fromToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        fromAmount: '1000000',
        userAddress: '0x1111111111111111111111111111111111111111',
      });
      expect(result).toBe(plan);
    });
  });
});
