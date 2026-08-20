import { pollUntil } from '@core/lib/polling';
import { getPublicClient } from '@core/services/intentClient';
import {
  GMX_V2_BASKET_MARKET_KEYS,
  GMX_V2_MARKETS,
  MORPHO_VAULTS,
} from '@zapengine/intent-engine';
import { type DepositPlan, NATIVE_TOKEN_ADDRESS } from '@zapengine/types/api';
import { equalsAddress } from '@zapengine/types/shared';
import {
  type Address,
  erc20Abi,
  formatEther,
  formatUnits,
  parseEther,
} from 'viem';
import { base } from 'viem/chains';

import {
  requestChainId,
  type SingleChainDepositRequest,
} from './singleChainDepositMachine';

const GAS_RESERVE_WEI = parseEther('0.0005');

export function copySingleChainDepositRequest(
  request: SingleChainDepositRequest,
): SingleChainDepositRequest {
  if (request.kind === 'invest') {
    return {
      ...request,
      ...(request.split ? { split: { ...request.split } } : {}),
    };
  }
  return { ...request };
}

export function assertSupportedSingleChainRequest(
  request: SingleChainDepositRequest,
): void {
  if (request.kind === 'invest' && request.sourceChainId !== base.id) {
    throw new Error('Single-chain Morpho deposits must use Base.');
  }
}

export function assertSingleChainPlan(
  plan: DepositPlan,
  request: SingleChainDepositRequest,
): void {
  const chainId = requestChainId(request);
  if (plan.sourceChainId !== chainId) {
    throw new Error(
      `Deposit plan source chain ${plan.sourceChainId} does not match ${chainId}.`,
    );
  }

  const mismatchedTransaction = [...plan.approvals, ...plan.calls].find(
    (transaction) => transaction.chainId !== chainId,
  );
  if (mismatchedTransaction) {
    throw new Error('Single-chain deposit plan contains a cross-chain action.');
  }
}

export function assertPlannedAccount(
  activeAddress: string | undefined,
  plannedAddress: Address,
  planLabel: string,
): void {
  if (!activeAddress) {
    throw new Error(`Reconnect the wallet used to prepare this ${planLabel}.`);
  }
  if (!equalsAddress(activeAddress, plannedAddress)) {
    throw new Error(
      `The connected wallet changed. Reconnect the wallet used to prepare this ${planLabel}.`,
    );
  }
}

function transactionValue(plan: DepositPlan): bigint {
  return [...plan.approvals, ...plan.calls].reduce(
    (total, transaction) => total + BigInt(transaction.value),
    0n,
  );
}

export function assertNativeGmxSpendWithinRequestedAmount(params: {
  request: SingleChainDepositRequest;
  plan: DepositPlan;
}): void {
  if (
    params.request.kind !== 'gmx-v2' &&
    params.request.kind !== 'gmx-v2-basket'
  ) {
    return;
  }
  if (!equalsAddress(params.request.fromToken, NATIVE_TOKEN_ADDRESS)) {
    return;
  }

  const requestedAmount = BigInt(params.request.amount);
  const plannedValue = transactionValue(params.plan);
  if (plannedValue > requestedAmount) {
    throw new Error(
      `Prepared GMX plan would spend ${formatEther(plannedValue)} ETH, exceeding the requested ${formatEther(requestedAmount)} ETH budget.`,
    );
  }
}

export async function assertSingleChainPreflight(params: {
  request: SingleChainDepositRequest;
  plan: DepositPlan;
  address: Address;
}): Promise<void> {
  assertNativeGmxSpendWithinRequestedAmount(params);

  const chainId = requestChainId(params.request);
  const publicClient = getPublicClient(chainId);
  const callsValue = transactionValue(params.plan);
  const fundingToken = params.request.fromToken as Address;
  const fundingAmount = BigInt(
    params.request.kind === 'invest'
      ? params.request.fromAmount
      : params.request.amount,
  );
  const isNative = equalsAddress(fundingToken, NATIVE_TOKEN_ADDRESS);

  if (isNative) {
    const required =
      (callsValue > fundingAmount ? callsValue : fundingAmount) +
      GAS_RESERVE_WEI;
    const balance = await publicClient.getBalance({ address: params.address });
    if (balance < required) {
      throw new Error(
        `Native balance too low on chain ${chainId}: need ${formatEther(required)} ETH including gas, have ${formatEther(balance)} ETH.`,
      );
    }
    return;
  }

  const [tokenBalance, nativeBalance] = await Promise.all([
    publicClient.readContract({
      address: fundingToken,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [params.address],
    }),
    publicClient.getBalance({ address: params.address }),
  ]);
  if (tokenBalance < fundingAmount) {
    throw new Error(
      `Funding balance too low on chain ${chainId}: need ${formatUnits(fundingAmount, 6)}, have ${formatUnits(tokenBalance, 6)}.`,
    );
  }
  if (nativeBalance < callsValue + GAS_RESERVE_WEI) {
    throw new Error(
      `ETH balance too low on chain ${chainId} for gas and protocol execution fees.`,
    );
  }
}

function positionTokens(request: SingleChainDepositRequest): Address[] {
  if (request.kind === 'invest') {
    return [MORPHO_VAULTS[base.id].MOONWELL_USDC];
  }
  if (request.kind === 'gmx-v2-basket') {
    return GMX_V2_BASKET_MARKET_KEYS.map(
      (marketKey) => GMX_V2_MARKETS[marketKey].marketToken,
    );
  }
  return [GMX_V2_MARKETS[request.marketKey].marketToken];
}

const UINT256_BITS = 256n;
const UINT256_MASK = (1n << UINT256_BITS) - 1n;

function packPositionBalances(balances: readonly bigint[]): bigint {
  return balances.reduce(
    (packed, balance, index) =>
      packed + (balance << (BigInt(index) * UINT256_BITS)),
    0n,
  );
}

function unpackPositionBalances(packed: bigint, count: number): bigint[] {
  return Array.from(
    { length: count },
    (_, index) => (packed >> (BigInt(index) * UINT256_BITS)) & UINT256_MASK,
  );
}

export async function readSingleChainPositionBalance(
  request: SingleChainDepositRequest,
  address: Address,
): Promise<bigint> {
  const publicClient = getPublicClient(requestChainId(request));
  const balances = await Promise.all(
    positionTokens(request).map((positionToken) =>
      publicClient.readContract({
        address: positionToken,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address],
      }),
    ),
  );
  return packPositionBalances(balances);
}

export async function waitForSingleChainPositionIncrease(params: {
  request: SingleChainDepositRequest;
  address: Address;
  baseline: bigint;
}): Promise<void> {
  const positionCount = positionTokens(params.request).length;
  const baselineBalances = unpackPositionBalances(
    params.baseline,
    positionCount,
  );
  await pollUntil({
    fn: () => readSingleChainPositionBalance(params.request, params.address),
    shouldStop: (packedBalance) =>
      unpackPositionBalances(packedBalance, positionCount).every(
        (balance, index) => balance > baselineBalances[index]!,
      ),
    intervalMs: 4_000,
    timeoutMs: params.request.kind === 'invest' ? 90_000 : 5 * 60_000,
  });
}
