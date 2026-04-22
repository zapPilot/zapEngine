import { describe, expect, it } from 'vitest';
import { decodeFunctionData, getAddress, type Address } from 'viem';

import { encodeMulticall3 } from '../../src/execution/multicall3.executor.js';
import { MULTICALL3_ADDRESS } from '../../src/types/chain.types.js';
import type { PreparedTransaction } from '../../src/types/transaction.types.js';

const TARGET_A: Address = '0x1111111111111111111111111111111111111111';
const TARGET_B: Address = '0x2222222222222222222222222222222222222222';

// Minimal Multicall3 ABI (both overloads) for decoding test output
const MULTICALL3_ABI = [
  {
    name: 'aggregate3',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'allowFailure', type: 'bool' },
          { name: 'callData', type: 'bytes' },
        ],
      },
    ],
    outputs: [],
  },
  {
    name: 'aggregate3Value',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'allowFailure', type: 'bool' },
          { name: 'value', type: 'uint256' },
          { name: 'callData', type: 'bytes' },
        ],
      },
    ],
    outputs: [],
  },
] as const;

function makeTx(
  overrides: Partial<PreparedTransaction> = {},
): PreparedTransaction {
  return {
    to: TARGET_A,
    data: '0xdeadbeef',
    value: '0',
    chainId: 1,
    gasLimit: '100000',
    meta: { intentType: 'TEST' },
    ...overrides,
  };
}

describe('encodeMulticall3', () => {
  it('throws on empty array', () => {
    expect(() => encodeMulticall3([])).toThrow(/empty/i);
  });

  it('targets the canonical Multicall3 address', () => {
    const out = encodeMulticall3([makeTx()]);
    expect(out.to).toBe(MULTICALL3_ADDRESS);
  });

  it('propagates chainId from txs[0]', () => {
    const out = encodeMulticall3([
      makeTx({ chainId: 8453 }),
      makeTx({ chainId: 8453, to: TARGET_B }),
    ]);
    expect(out.chainId).toBe(8453);
  });

  it('uses aggregate3 when no tx carries a value', () => {
    const out = encodeMulticall3([
      makeTx({ to: TARGET_A, data: '0xaa' }),
      makeTx({ to: TARGET_B, data: '0xbb' }),
    ]);
    expect(out.value).toBe('0');

    const decoded = decodeFunctionData({
      abi: MULTICALL3_ABI,
      data: out.data as `0x${string}`,
    });
    expect(decoded.functionName).toBe('aggregate3');
    const [calls] = decoded.args as unknown as [
      Array<{
        target: Address;
        allowFailure: boolean;
        callData: `0x${string}`;
      }>,
    ];
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({
      target: getAddress(TARGET_A),
      allowFailure: false,
      callData: '0xaa',
    });
    expect(calls[1]).toEqual({
      target: getAddress(TARGET_B),
      allowFailure: false,
      callData: '0xbb',
    });
  });

  it('switches to aggregate3Value when any tx has value > 0', () => {
    const out = encodeMulticall3([
      makeTx({ value: '0' }),
      makeTx({ to: TARGET_B, value: '1000' }),
    ]);
    expect(out.value).toBe('1000');

    const decoded = decodeFunctionData({
      abi: MULTICALL3_ABI,
      data: out.data as `0x${string}`,
    });
    expect(decoded.functionName).toBe('aggregate3Value');
    const [calls] = decoded.args as unknown as [
      Array<{
        target: Address;
        allowFailure: boolean;
        value: bigint;
        callData: `0x${string}`;
      }>,
    ];
    expect(calls).toHaveLength(2);
    expect(calls[0]?.value).toBe(0n);
    expect(calls[1]?.value).toBe(1000n);
  });

  it('sums tx values into the batch value', () => {
    const out = encodeMulticall3([
      makeTx({ value: '500' }),
      makeTx({ to: TARGET_B, value: '250' }),
    ]);
    expect(out.value).toBe('750');
  });

  it('sums gas limits with 50k overhead', () => {
    const out = encodeMulticall3([
      makeTx({ gasLimit: '100000' }),
      makeTx({ to: TARGET_B, gasLimit: '200000' }),
    ]);
    // 100k + 200k + 50k overhead
    expect(out.gasLimit).toBe('350000');
    expect(out.meta.estimatedGas).toBe('350000');
  });

  it('defaults missing gasLimit to 100k per tx', () => {
    const out = encodeMulticall3([makeTx({ gasLimit: undefined })]);
    // 100k default + 50k overhead
    expect(out.gasLimit).toBe('150000');
  });

  it('sets intentType MULTICALL3_BATCH in meta', () => {
    const out = encodeMulticall3([makeTx()]);
    expect(out.meta.intentType).toBe('MULTICALL3_BATCH');
  });

  it('encodes allowFailure=false so the batch is atomic', () => {
    const out = encodeMulticall3([makeTx()]);
    const decoded = decodeFunctionData({
      abi: MULTICALL3_ABI,
      data: out.data as `0x${string}`,
    });
    const [calls] = decoded.args as unknown as [
      Array<{ allowFailure: boolean }>,
    ];
    expect(calls.every((c) => c.allowFailure === false)).toBe(true);
  });
});
