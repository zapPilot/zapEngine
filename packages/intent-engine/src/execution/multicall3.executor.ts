import { encodeFunctionData, type Address } from 'viem';

import { MULTICALL3_ADDRESS } from '../types/chain.types.js';
import type { PreparedTransaction } from '../types/transaction.types.js';

/**
 * Multicall3 aggregate3 ABI
 */
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
    outputs: [
      {
        name: 'returnData',
        type: 'tuple[]',
        components: [
          { name: 'success', type: 'bool' },
          { name: 'returnData', type: 'bytes' },
        ],
      },
    ],
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
    outputs: [
      {
        name: 'returnData',
        type: 'tuple[]',
        components: [
          { name: 'success', type: 'bool' },
          { name: 'returnData', type: 'bytes' },
        ],
      },
    ],
  },
] as const;

/**
 * Call structure for Multicall3
 */
interface Multicall3Call {
  target: Address;
  allowFailure: boolean;
  callData: `0x${string}`;
}

/**
 * Call structure for Multicall3 with value
 */
interface Multicall3ValueCall extends Multicall3Call {
  value: bigint;
}

/**
 * Encode multiple transactions into a single Multicall3 transaction
 *
 * @param txs - Array of prepared transactions to batch
 * @returns Single prepared transaction using Multicall3
 */
export function encodeMulticall3(
  txs: PreparedTransaction[],
): PreparedTransaction {
  if (txs.length === 0) {
    throw new Error('Cannot encode empty transaction array');
  }

  // Check if any transaction has value
  const hasValue = txs.some((tx) => BigInt(tx.value) > 0n);

  if (hasValue) {
    return encodeMulticall3WithValue(txs);
  }

  // Use aggregate3 for transactions without value
  const calls: Multicall3Call[] = txs.map((tx) => ({
    target: tx.to as Address,
    allowFailure: false, // Revert entire batch if any call fails
    callData: tx.data as `0x${string}`,
  }));

  const calldata = encodeFunctionData({
    abi: MULTICALL3_ABI,
    functionName: 'aggregate3',
    args: [calls],
  });

  // Estimate gas as sum of individual gas limits + overhead
  const totalGas = txs.reduce(
    (sum, tx) => sum + BigInt(tx.gasLimit ?? '100000'),
    50000n, // Multicall3 overhead
  );

  return {
    to: MULTICALL3_ADDRESS,
    data: calldata,
    value: '0',
    chainId: txs[0]!.chainId,
    gasLimit: totalGas.toString(),
    meta: {
      intentType: 'MULTICALL3_BATCH',
      estimatedGas: totalGas.toString(),
    },
  };
}

/**
 * Encode transactions with ETH value using aggregate3Value
 */
function encodeMulticall3WithValue(
  txs: PreparedTransaction[],
): PreparedTransaction {
  const calls: Multicall3ValueCall[] = txs.map((tx) => ({
    target: tx.to as Address,
    allowFailure: false,
    value: BigInt(tx.value),
    callData: tx.data as `0x${string}`,
  }));

  const calldata = encodeFunctionData({
    abi: MULTICALL3_ABI,
    functionName: 'aggregate3Value',
    args: [calls],
  });

  // Total ETH value to send
  const totalValue = txs.reduce((sum, tx) => sum + BigInt(tx.value), 0n);

  // Estimate gas
  const totalGas = txs.reduce(
    (sum, tx) => sum + BigInt(tx.gasLimit ?? '100000'),
    50000n,
  );

  return {
    to: MULTICALL3_ADDRESS,
    data: calldata,
    value: totalValue.toString(),
    chainId: txs[0]!.chainId,
    gasLimit: totalGas.toString(),
    meta: {
      intentType: 'MULTICALL3_BATCH',
      estimatedGas: totalGas.toString(),
    },
  };
}
