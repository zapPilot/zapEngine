import {
  createPublicClient,
  encodeFunctionData,
  fallback,
  http,
  keccak256,
  type PublicClient,
  type Transport,
} from 'viem';
import { PUBLIC_RPCS, STRATEGY_CHAIN } from '@/config/verifiable-strategy';
import { encodeInputs } from './encoding';
import type {
  AssetState,
  AssetView,
  CalculatorInput,
  CalculatorResult,
  CallStep,
  Dataset,
  ExitResult,
} from './types';

export function calculatorClient(): PublicClient<
  Transport,
  typeof STRATEGY_CHAIN
> {
  return createPublicClient({
    chain: STRATEGY_CHAIN,
    transport: fallback(
      PUBLIC_RPCS.map((url) => http(url, { timeout: 12000, retryCount: 1 })),
    ),
  });
}
export type CalculatorClient = Pick<
  ReturnType<typeof calculatorClient>,
  'getChainId' | 'getBlockNumber' | 'getBytecode' | 'readContract'
>;
export async function verifyDeployment(
  client: CalculatorClient,
  data: Dataset,
  blockNumber?: bigint,
) {
  if (!data.deployment) throw new Error('Not deployed yet');
  if (
    (await client.getChainId()) !== STRATEGY_CHAIN.id ||
    data.deployment.chainId !== STRATEGY_CHAIN.id
  )
    throw new Error('Wrong network: Arbitrum Sepolia required');
  const block = blockNumber ?? (await client.getBlockNumber());
  if (block < BigInt(data.deployment.blockNumber))
    throw new Error('RPC block predates deployment');
  const code = await client.getBytecode({
    address: data.deployment.address,
    blockNumber: block,
  });
  if (!code || code === '0x')
    throw new Error('No contract bytecode at this address');
  const codehash = keccak256(code);
  if (
    codehash !== data.runtimeCodehash ||
    codehash !== data.deployment.runtimeCodehash
  )
    throw new Error('Runtime codehash mismatch');
  return { blockNumber: block, codehash };
}
export async function runCalculator(
  input: CalculatorInput,
  data: Dataset,
  client: CalculatorClient = calculatorClient(),
): Promise<CalculatorResult> {
  const encoded = encodeInputs(input);
  const { blockNumber } = await verifyDeployment(client, data);
  const deployment = data.deployment!;
  const steps: CallStep[] = [];
  async function call(name: CallStep['name'], args: readonly unknown[]) {
    const output = await client.readContract({
      address: deployment.address,
      abi: data.abi,
      functionName: name,
      args,
      blockNumber,
    });
    steps.push({
      name,
      args,
      output,
      data: encodeFunctionData({ abi: data.abi, functionName: name, args }),
    });
    return output;
  }
  const empty = Array.from({ length: 3 }, () => ({
    observed: 0,
    actionable: 0,
    end_day: 0,
    blocked: 0,
  }));
  const warmup = (await call('warmup', [
    empty,
    encoded.previous,
  ])) as AssetState[];
  let prior = warmup;
  if (input.stateMode === 'explicit') {
    if (
      input.priorStates.length !== 3 ||
      input.priorStates.some(
        (s) => s.length !== 4 || s.some((v) => !Number.isInteger(v) || v < 0),
      )
    )
      throw new Error('Invalid explicit prior state');
    prior = input.priorStates.map((s) => ({
      observed: s[0]!,
      actionable: s[1]!,
      end_day: s[2]!,
      blocked: s[3]!,
    }));
  }
  const [views, states] = (await call('observe', [
    prior,
    encoded.current,
    encoded.day,
    input.crossOnTouch,
  ])) as [AssetView[], AssetState[]];
  const exit = (await call('cross_down_exit', [
    views,
    encoded.allocation,
    input.lastExecutedDay,
    encoded.day,
  ])) as ExitResult;
  return { blockNumber, warmup, states, views, exit, steps };
}
