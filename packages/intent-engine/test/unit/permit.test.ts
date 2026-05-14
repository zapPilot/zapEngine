import type { PermitRequest, PreparedTransaction } from '@zapengine/types/api';
import { describe, expect, it, vi } from 'vitest';
import { decodeFunctionData, type Address } from 'viem';

import {
  buildPermitTypedData,
  encodePermitCall,
  wrapPermitAndCallsInMulticall3,
} from '../../src/execution/permit.js';

const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const USER = '0x1111111111111111111111111111111111111111' as Address;
const LIFI_DIAMOND = '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE' as Address;

describe('permit execution helpers', () => {
  it('builds the USDC EIP-2612 typed data from token metadata and nonce', async () => {
    const readContract = vi.fn().mockImplementation(({ functionName }) => {
      if (functionName === 'name') {
        return Promise.resolve('USD Coin');
      }
      if (functionName === 'version') {
        return Promise.resolve('2');
      }
      if (functionName === 'nonces') {
        return Promise.resolve(9n);
      }
      throw new Error(`Unexpected ${String(functionName)}`);
    });

    const permit = await buildPermitTypedData({
      token: BASE_USDC,
      owner: USER,
      spender: LIFI_DIAMOND,
      value: '10000',
      deadline: '2000000000',
      publicClient: { chain: { id: 8453 }, readContract } as never,
    });

    expect(permit).toMatchObject({
      token: BASE_USDC,
      owner: USER,
      spender: LIFI_DIAMOND,
      value: '10000',
      nonce: '9',
      deadline: '2000000000',
      typedData: {
        domain: {
          name: 'USD Coin',
          version: '2',
          chainId: 8453,
          verifyingContract: BASE_USDC,
        },
        primaryType: 'Permit',
        message: {
          owner: USER,
          spender: LIFI_DIAMOND,
          value: '10000',
          nonce: '9',
          deadline: '2000000000',
        },
      },
    });
  });

  it('encodes a signed permit call and wraps it with leg calls in Multicall3', () => {
    const permit: PermitRequest = {
      token: BASE_USDC,
      owner: USER,
      spender: LIFI_DIAMOND,
      value: '10000',
      nonce: '9',
      deadline: '2000000000',
      typedData: {
        domain: {
          name: 'USD Coin',
          version: '2',
          chainId: 8453,
          verifyingContract: BASE_USDC,
        },
        types: {
          Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ],
        },
        primaryType: 'Permit',
        message: {
          owner: USER,
          spender: LIFI_DIAMOND,
          value: '10000',
          nonce: '9',
          deadline: '2000000000',
        },
      },
    };

    const signature = `0x${'a'.repeat(64)}${'b'.repeat(64)}1b` as `0x${string}`;
    const permitTx = encodePermitCall(BASE_USDC, {
      ...permit,
      signature,
    });
    const legTx: PreparedTransaction = {
      to: LIFI_DIAMOND,
      data: '0x1234',
      value: '0',
      chainId: 8453,
      gasLimit: '300000',
      meta: { intentType: 'SUPPLY' },
    };
    const wrapped = wrapPermitAndCallsInMulticall3(permitTx, [legTx]);

    const decodedPermit = decodeFunctionData({
      abi: [
        {
          type: 'function',
          name: 'permit',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
            { name: 'v', type: 'uint8' },
            { name: 'r', type: 'bytes32' },
            { name: 's', type: 'bytes32' },
          ],
          outputs: [],
        },
      ] as const,
      data: permitTx.data as `0x${string}`,
    });

    expect(decodedPermit.functionName).toBe('permit');
    expect(decodedPermit.args).toEqual([
      USER,
      LIFI_DIAMOND,
      10000n,
      2_000_000_000n,
      27,
      `0x${'a'.repeat(64)}`,
      `0x${'b'.repeat(64)}`,
    ]);
    expect(wrapped.to).toBe('0xcA11bde05977b3631167028862bE2a173976CA11');
    expect(wrapped.meta.intentType).toBe('MULTICALL3_BATCH');
  });
});
