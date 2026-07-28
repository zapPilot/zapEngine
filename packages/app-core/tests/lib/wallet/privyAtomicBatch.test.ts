import {
  assertSameChainTransactions,
  atomicBatchSummary,
  createIdempotencyKey,
  decodeBase64,
  errorMessage,
  getPrivyAtomicBatchChain,
  toWalletSendCall,
  toWalletTypedData,
} from '@core/lib/wallet/privyAtomicBatch';
import type { PreparedTransaction } from '@zapengine/types/api';
import { encodeFunctionData, erc20Abi } from 'viem';
import { describe, expect, it } from 'vitest';

const SPENDER = '0x9999999999999999999999999999999999999999' as const;

function tx(overrides: Partial<PreparedTransaction> = {}): PreparedTransaction {
  return {
    to: '0x1111111111111111111111111111111111111111',
    data: '0x',
    value: '0',
    chainId: 8453,
    meta: { intentType: 'swap' },
    ...overrides,
  };
}

describe('getPrivyAtomicBatchChain', () => {
  it('returns base and arbitrum', () => {
    expect(getPrivyAtomicBatchChain(8453).id).toBe(8453);
    expect(getPrivyAtomicBatchChain(42161).id).toBe(42161);
  });

  it('rejects chains outside the atomic-batch contract', () => {
    for (const chainId of [1, 10, 1337]) {
      expect(() => getPrivyAtomicBatchChain(chainId)).toThrow(
        `not configured for chain ${chainId}`,
      );
    }
  });
});

describe('assertSameChainTransactions', () => {
  it('passes when every transaction matches the batch chain', () => {
    expect(() => assertSameChainTransactions([tx(), tx()], 8453)).not.toThrow();
  });

  it('names the mismatched chain', () => {
    expect(() =>
      assertSameChainTransactions([tx(), tx({ chainId: 42161 })], 8453),
    ).toThrow('transaction for chain 42161, expected 8453');
  });
});

describe('toWalletSendCall', () => {
  it('converts the decimal value into a hex quantity', () => {
    expect(toWalletSendCall(tx({ value: '1000000' }))).toEqual({
      to: '0x1111111111111111111111111111111111111111',
      data: '0x',
      value: '0xf4240',
    });
  });

  it('keeps zero values canonical', () => {
    expect(toWalletSendCall(tx()).value).toBe('0x0');
  });
});

describe('toWalletTypedData', () => {
  it('accepts a well-formed EIP-712 payload', () => {
    const payload = {
      domain: { name: 'ZapPilot' },
      types: { ZapPilotIntent: [] },
      primaryType: 'ZapPilotIntent',
      message: { batchHash: '0x' },
    };
    expect(toWalletTypedData(payload)).toBe(payload);
  });

  it('rejects payloads missing any EIP-712 member', () => {
    const valid = {
      domain: {},
      types: {},
      primaryType: 'X',
      message: {},
    };
    for (const key of ['domain', 'types', 'primaryType', 'message']) {
      const broken: Record<string, unknown> = { ...valid };
      delete broken[key];
      expect(() => toWalletTypedData(broken)).toThrow(
        'Privy preview typed data payload is malformed',
      );
    }
  });
});

describe('decodeBase64', () => {
  it('decodes standard vectors including padding variants', () => {
    expect([...decodeBase64('aGVsbG8=')]).toEqual([104, 101, 108, 108, 111]);
    expect([...decodeBase64('YQ==')]).toEqual([97]);
    expect([...decodeBase64('YWI=')]).toEqual([97, 98]);
    expect([...decodeBase64('YWJj')]).toEqual([97, 98, 99]);
    expect([...decodeBase64('YQ')]).toEqual([97]);
    expect([...decodeBase64('YWI')]).toEqual([97, 98]);
    expect([...decodeBase64('')]).toEqual([]);
  });

  it('ignores whitespace inside the payload', () => {
    expect([...decodeBase64('aGVs\nbG8=')]).toEqual([104, 101, 108, 108, 111]);
  });

  it('matches Buffer for arbitrary binary payloads', () => {
    const bytes = Uint8Array.from({ length: 64 }, (_, i) => (i * 37) % 256);
    const encoded = Buffer.from(bytes).toString('base64');
    expect([...decodeBase64(encoded)]).toEqual([...bytes]);
  });

  it('rejects non-base64 characters', () => {
    expect(() => decodeBase64('a$c=')).toThrow('Invalid base64 payload');
  });

  it.each(['A', '====', 'AB=', 'YQ===', 'Y=Q=', 'YQ==YQ=='])(
    'rejects malformed length or padding in %s',
    (payload) => {
      expect(() => decodeBase64(payload)).toThrow('Invalid base64 payload');
    },
  );
});

describe('atomicBatchSummary', () => {
  it('summarizes approve calls and skips everything else', () => {
    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [SPENDER, 123n],
    });
    const summary = atomicBatchSummary([
      tx({ data: approveData }),
      tx({ data: '0xdeadbeef' }),
      tx(),
    ]);
    expect(summary.approvals).toEqual([
      {
        token: '0x1111111111111111111111111111111111111111',
        spender: SPENDER,
        amount: '123',
      },
    ]);
  });
});

describe('createIdempotencyKey', () => {
  it('returns unique non-empty keys', () => {
    const first = createIdempotencyKey();
    const second = createIdempotencyKey();
    expect(first).not.toBe('');
    expect(first).not.toBe(second);
  });
});

describe('errorMessage', () => {
  it('unwraps Error instances and stringifies the rest', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('plain')).toBe('plain');
  });
});
