import { txRequest } from '@zapengine/app-core/lib/wallet/txRequest';
import type { Account } from 'viem';
import { describe, expect, it } from 'vitest';

const account = {
  address: '0x1111111111111111111111111111111111111111',
} as Account;

describe('txRequest', () => {
  it('maps a prepared transaction into a viem transaction request', () => {
    const tx = {
      to: '0x2222222222222222222222222222222222222222',
      data: '0x1234',
      value: '42',
      chainId: 8453,
      gasLimit: '21000',
    } as const;

    expect(txRequest(tx, account)).toEqual({
      account,
      to: tx.to,
      data: tx.data,
      value: 42n,
      chainId: 8453,
      gas: 21000n,
    });
  });

  it('omits gas when the prepared transaction has no gas limit', () => {
    const tx = {
      to: '0x3333333333333333333333333333333333333333',
      data: '0xabcd',
      value: 0,
      chainId: 42161,
    } as const;

    expect(txRequest(tx, account)).toEqual({
      account,
      to: tx.to,
      data: tx.data,
      value: 0n,
      chainId: 42161,
    });
  });
});
