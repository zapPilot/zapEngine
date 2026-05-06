import { encodeFunctionData, type Address } from 'viem';

import { MULTICALL3_ADDRESS } from '../types/chain.types.js';
import type { PreparedTransaction } from '../types/transaction.types.js';

const CALL_RESULT_OUTPUT = {
  name: 'returnData',
  type: 'tuple[]',
  components: [
    { name: 'success', type: 'bool' },
    { name: 'returnData', type: 'bytes' },
  ],
} as const;

const CALL_COMPONENTS = [
  { name: 'target', type: 'address' },
  { name: 'allowFailure', type: 'bool' },
  { name: 'callData', type: 'bytes' },
] as const;

const VALUE_CALL_COMPONENTS = [
  { name: 'target', type: 'address' },
  { name: 'allowFailure', type: 'bool' },
  { name: 'value', type: 'uint256' },
  { name: 'callData', type: 'bytes' },
] as const;

function multicallAbiEntry(
  name: 'aggregate3' | 'aggregate3Value',
  components: typeof CALL_COMPONENTS | typeof VALUE_CALL_COMPONENTS,
) {
  return {
    name,
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'calls', type: 'tuple[]', components }],
    outputs: [CALL_RESULT_OUTPUT],
  } as const;
}

/**
 * Multicall3 aggregate3 ABI
 */
const MULTICALL3_ABI = [
  multicallAbiEntry('aggregate3', CALL_COMPONENTS),
  multicallAbiEntry('aggregate3Value', VALUE_CALL_COMPONENTS),
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

const MULTICALL3_OVERHEAD = 50000n;

function calculateTotalGas(txs: PreparedTransaction[]): bigint {
  return txs.reduce(
    (sum, tx) => sum + BigInt(tx.gasLimit ?? '100000'),
    MULTICALL3_OVERHEAD,
  );
}

function createBatchTransaction(
  txs: PreparedTransaction[],
  calldata: `0x${string}`,
  value: string,
  totalGas: bigint,
): PreparedTransaction {
  return {
    to: MULTICALL3_ADDRESS,
    data: calldata,
    value,
    chainId: txs[0]!.chainId,
    gasLimit: totalGas.toString(),
    meta: {
      intentType: 'MULTICALL3_BATCH',
      estimatedGas: totalGas.toString(),
    },
  };
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

  const totalGas = calculateTotalGas(txs);

  return createBatchTransaction(txs, calldata, '0', totalGas);
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

  const totalValue = txs.reduce((sum, tx) => sum + BigInt(tx.value), 0n);
  const totalGas = calculateTotalGas(txs);

  return createBatchTransaction(txs, calldata, totalValue.toString(), totalGas);
}
