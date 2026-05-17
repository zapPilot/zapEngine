import { describe, expect, it, vi } from 'vitest';
import { decodeFunctionData, erc20Abi, type Address } from 'viem';

import {
  buildApproveTx,
  needsApproval,
} from '../../src/approvals/erc20Approval.js';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const TOKEN = '0x2222222222222222222222222222222222222222' as Address;
const SPENDER = '0x3333333333333333333333333333333333333333' as Address;

function makePublicClient(readContract: ReturnType<typeof vi.fn>) {
  return { readContract } as never;
}

describe('ERC20 approval helpers', () => {
  it('skips approval when allowance covers the exact required amount', async () => {
    const readContract = vi.fn().mockResolvedValue(1000n);

    await expect(
      needsApproval({
        publicClient: makePublicClient(readContract),
        owner: USER,
        requirement: {
          tokenAddress: TOKEN,
          spenderAddress: SPENDER,
          amount: 1000n,
        },
      }),
    ).resolves.toBe(false);

    expect(readContract).toHaveBeenCalledWith({
      address: TOKEN,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [USER, SPENDER],
    });
  });

  it('requires approval when allowance is below the exact required amount', async () => {
    const readContract = vi.fn().mockResolvedValue(999n);

    await expect(
      needsApproval({
        publicClient: makePublicClient(readContract),
        owner: USER,
        requirement: {
          tokenAddress: TOKEN,
          spenderAddress: SPENDER,
          amount: 1000n,
        },
      }),
    ).resolves.toBe(true);
  });

  it('fails open to approval when allowance lookup fails', async () => {
    const readContract = vi.fn().mockRejectedValue(new Error('rpc down'));

    await expect(
      needsApproval({
        publicClient: makePublicClient(readContract),
        owner: USER,
        requirement: {
          tokenAddress: TOKEN,
          spenderAddress: SPENDER,
          amount: 1000n,
        },
      }),
    ).resolves.toBe(true);
  });

  it('builds an exact amount approve transaction', () => {
    const tx = buildApproveTx({
      token: TOKEN,
      spender: SPENDER,
      amount: '1000',
      chainId: 42161,
      gasLimit: '60000',
    });

    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: tx.data as `0x${string}`,
    });

    expect(tx).toMatchObject({
      to: TOKEN,
      value: '0',
      chainId: 42161,
      gasLimit: '60000',
      meta: { intentType: 'ERC20_APPROVE' },
    });
    expect(decoded.functionName).toBe('approve');
    expect(decoded.args).toEqual([SPENDER, 1000n]);
  });
});
