import {
  type ApprovalRequirement,
  assertApprovalCaps,
  assertMinReceived,
  buildApproveTx,
  type BundleSimulationAdapter,
  composeDeposit,
  GMX_V2_ARBITRUM_CHAIN_ID,
  GMX_V2_GAS_ESTIMATES,
  GMX_V2_TOKENS,
  type IntentEngine,
  type LiFiAdapter,
  MORPHO_VAULTS,
  needsApproval,
  type TransactionQuote,
} from '@zapengine/intent-engine';
import {
  BASE_CHAIN_ID,
  BASE_USDC_ADDRESS,
  type ChainSplit,
  type DepositPlan,
  DepositPlanSchema,
  NATIVE_TOKEN_ADDRESS,
  type PlanOrchestrationDepositPlan,
  type PlanOrchestrationDepositRequest,
  type PlanOrchestrationWithdrawRequest,
  type PreparedTransaction,
  STRATEGY_DEPOSIT_ID,
  type StrategyDepositPlan,
  StrategyDepositPlanSchema,
  SUPPORTED_DEPOSIT_CHAINS,
  type WithdrawPlan,
  WithdrawPlanSchema,
} from '@zapengine/types/api';
import {
  type Address,
  decodeFunctionData,
  erc20Abi,
  type PublicClient,
} from 'viem';

import {
  PlanSimulationFailedError,
  PlanSimulationUnavailableError,
} from './errors';
import type { DepositPublicClients } from './publicClients';

export interface PlanOrchestrationService {
  buildDeposit(
    request: Exclude<PlanOrchestrationDepositRequest, { kind: 'strategy' }>,
  ): Promise<DepositPlan>;
  buildDeposit(
    request: Extract<PlanOrchestrationDepositRequest, { kind: 'strategy' }>,
  ): Promise<StrategyDepositPlan>;
  buildDeposit(
    request: PlanOrchestrationDepositRequest,
  ): Promise<PlanOrchestrationDepositPlan>;
  buildWithdraw(
    request: PlanOrchestrationWithdrawRequest,
  ): Promise<WithdrawPlan>;
}

/** Chain-id-keyed allocation weights, as consumed by composeDeposit. */
export type DepositChainSplit = Partial<Record<number, number>>;

/** Bundle-simulation dependency for the fail-closed plan gate. */
export interface PlanSimulationDeps {
  adapter: BundleSimulationAdapter;
  mode: 'enforce' | 'off';
}

export interface PlanOrchestrationServiceDeps {
  intentEngine: Pick<
    IntentEngine,
    'buildGmxV2Supply' | 'buildGmxV2Withdraw' | 'buildWithdrawSwap'
  > &
    Partial<Pick<IntentEngine, 'buildSupply' | 'buildSwap' | 'getTokenPrice'>>;
  adapter: LiFiAdapter;
  publicClients: DepositPublicClients;
  composeDeposit?: typeof composeDeposit;
  /** Default allocation for Base-source invest plans; requests may override. */
  defaultSplit?: DepositChainSplit;
  /** Hyperliquid network for HLP follow-up descriptors (default mainnet). */
  hyperliquidNetwork?: 'mainnet' | 'testnet';
  /** Fail-closed bundle simulation gate; omitted = off. */
  simulation?: PlanSimulationDeps;
}

function chainSplitFromRequest(
  split: ChainSplit | undefined,
): DepositChainSplit | undefined {
  if (!split) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(split).map(([chainId, weight]) => [Number(chainId), weight]),
  );
}

function publicClientFor(
  publicClients: DepositPublicClients,
  chainId: number,
): PublicClient {
  const publicClient = publicClients[chainId];
  if (!publicClient) {
    throw new Error(`No public client configured for chain ${chainId}`);
  }
  return publicClient;
}

function approvalRequirementFromTx(
  tx: PreparedTransaction,
): ApprovalRequirement {
  const decoded = decodeFunctionData({
    abi: erc20Abi,
    data: tx.data as `0x${string}`,
  });

  if (decoded.functionName !== 'approve') {
    throw new Error('Expected ERC20 approve transaction');
  }

  const [spenderAddress, amount] = decoded.args;
  return {
    tokenAddress: tx.to as Address,
    spenderAddress,
    amount,
  };
}

async function filterNeededApprovals(params: {
  approvals: PreparedTransaction[];
  owner: Address;
  publicClient: PublicClient;
}): Promise<PreparedTransaction[]> {
  const neededApprovals: PreparedTransaction[] = [];

  for (const approval of params.approvals) {
    const requirement = approvalRequirementFromTx(approval);
    if (
      await needsApproval({
        publicClient: params.publicClient,
        owner: params.owner,
        requirement,
      })
    ) {
      neededApprovals.push(
        buildApproveTx({
          token: requirement.tokenAddress,
          spender: requirement.spenderAddress,
          amount: requirement.amount.toString(),
          chainId: approval.chainId,
          gasLimit: approval.gasLimit ?? GMX_V2_GAS_ESTIMATES.approve,
        }),
      );
    }
  }

  return neededApprovals;
}

// The Morpho withdraw-swap plan surfaces a single LiFi approval as a
// requirement (token/spender/amount), not a prepared tx. Convert it into an
// approve tx only when the on-chain allowance is insufficient.
async function neededApprovalFromRequirement(params: {
  approval:
    | { tokenAddress: Address; spenderAddress: Address; amount: string }
    | undefined;
  owner: Address;
  publicClient: PublicClient;
  chainId: number;
}): Promise<PreparedTransaction[]> {
  if (!params.approval) {
    return [];
  }

  const requirement: ApprovalRequirement = {
    tokenAddress: params.approval.tokenAddress,
    spenderAddress: params.approval.spenderAddress,
    amount: BigInt(params.approval.amount),
  };

  if (
    !(await needsApproval({
      publicClient: params.publicClient,
      owner: params.owner,
      requirement,
    }))
  ) {
    return [];
  }

  return [
    buildApproveTx({
      token: requirement.tokenAddress,
      spender: requirement.spenderAddress,
      amount: requirement.amount.toString(),
      chainId: params.chainId,
    }),
  ];
}

/** Server-side slippage ceiling for routed calls (bps). */
const MAX_PLAN_SLIPPAGE_BPS = 100;

/**
 * Fail-closed gate, run on every plan before it is returned:
 * the pure safety validators always, then the bundle simulation when
 * enforced. `followUps` (HyperCore actions) are not EVM transactions and are
 * never simulated — only the source-chain approvals+calls batch is.
 */
async function assertPlanSafety(params: {
  plan: {
    approvals: PreparedTransaction[];
    calls: PreparedTransaction[];
    sourceChainId: number;
  };
  userAddress: string;
  intent: { fromToken?: string; fromAmount?: string };
  simulation: PlanSimulationDeps | undefined;
}): Promise<void> {
  assertApprovalCaps(params.plan, params.intent);
  assertMinReceived(params.plan, { maxSlippageBps: MAX_PLAN_SLIPPAGE_BPS });

  if (params.simulation?.mode !== 'enforce') {
    return;
  }

  const result = await params.simulation.adapter.simulateBundle({
    chainId: params.plan.sourceChainId,
    from: params.userAddress,
    calls: [...params.plan.approvals, ...params.plan.calls],
  });

  if (result.status === 'failed') {
    throw new PlanSimulationFailedError(result.reason);
  }
  if (result.status === 'unavailable') {
    throw new PlanSimulationUnavailableError(result.reason);
  }
}

async function finalizePlan<
  T extends {
    approvals: PreparedTransaction[];
    calls: PreparedTransaction[];
    sourceChainId: number;
  },
>(
  plan: T,
  params: {
    userAddress: string;
    simulation: PlanSimulationDeps | undefined;
  },
): Promise<T> {
  await assertPlanSafety({
    plan,
    userAddress: params.userAddress,
    intent: {},
    simulation: params.simulation,
  });
  return plan;
}

const USD_DECIMALS = 6n;
const USD_SCALE = 10n ** USD_DECIMALS;
const PRICE_SCALE = 10n ** 12n;
const WEI_SCALE = 10n ** 18n;

function hasOnlyAsciiDigits(input: string): boolean {
  return (
    input.length > 0 &&
    [...input].every((character) => character >= '0' && character <= '9')
  );
}

function trimTrailingZeros(input: string): string {
  let end = input.length;
  while (end > 0 && input[end - 1] === '0') {
    end -= 1;
  }
  return input.slice(0, end);
}

function decimalToScaledInteger(value: string, scale: bigint): bigint {
  const parts = value.trim().split('.');
  const whole = parts[0] ?? '';
  const decimal = parts[1] ?? '';
  if (
    parts.length > 2 ||
    !hasOnlyAsciiDigits(whole) ||
    (parts.length === 2 && !hasOnlyAsciiDigits(decimal))
  ) {
    throw new Error(`Invalid decimal value: ${value}`);
  }

  const scaleDigits = scale.toString().length - 1;
  const fraction = decimal.slice(0, scaleDigits).padEnd(scaleDigits, '0');
  return BigInt(whole) * scale + BigInt(fraction || '0');
}

function tokenAmountFromUsd(params: {
  usd6: bigint;
  decimals: number;
  priceUsd: string;
}): string {
  const price = decimalToScaledInteger(params.priceUsd, PRICE_SCALE);
  if (price <= 0n) {
    throw new Error('Funding token price must be greater than zero');
  }

  const amount =
    (params.usd6 * 10n ** BigInt(params.decimals) * PRICE_SCALE) /
    (USD_SCALE * price);
  if (amount <= 0n) {
    throw new Error('Strategy allocation is too small for the funding token');
  }
  return amount.toString();
}

function scaledIntegerToDecimal(value: bigint, scaleDigits: number): string {
  const scale = 10n ** BigInt(scaleDigits);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(scaleDigits, '0');
  const trimmedFraction = trimTrailingZeros(fraction);
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole.toString();
}

function sumGasUsd(values: readonly string[]): string {
  const totalUsd6 = values.reduce(
    (sum, value) => sum + decimalToScaledInteger(value || '0', USD_SCALE),
    0n,
  );
  return scaledIntegerToDecimal(totalUsd6, Number(USD_DECIMALS));
}

function transactionGasUnits(
  transactions: readonly PreparedTransaction[],
): bigint {
  return transactions.reduce((total, transaction) => {
    const estimate = transaction.gasLimit ?? transaction.meta.estimatedGas;
    if (!estimate) {
      throw new Error(
        `Missing gas estimate for ${transaction.meta.intentType} transaction`,
      );
    }
    return total + BigInt(estimate);
  }, 0n);
}

function gasUsdFromUnits(params: {
  gasUnits: bigint;
  gasPriceWei: bigint;
  nativePriceUsd: string;
}): string {
  const nativePrice = decimalToScaledInteger(
    params.nativePriceUsd,
    PRICE_SCALE,
  );
  if (params.gasPriceWei <= 0n || nativePrice <= 0n) {
    throw new Error('Chain gas price inputs must be greater than zero');
  }

  const denominator = WEI_SCALE * PRICE_SCALE;
  const numerator =
    params.gasUnits * params.gasPriceWei * nativePrice * USD_SCALE;
  const usd6 = (numerator + denominator - 1n) / denominator;
  return scaledIntegerToDecimal(usd6, Number(USD_DECIMALS));
}

async function getChainGasPricing(params: {
  intentEngine: PlanOrchestrationServiceDeps['intentEngine'];
  publicClient: PublicClient;
  chainId: number;
}): Promise<{ gasPriceWei: bigint; nativePriceUsd: string }> {
  if (!params.intentEngine.getTokenPrice) {
    throw new Error('Gas pricing dependency is not configured');
  }
  const [gasPriceWei, nativeToken] = await Promise.all([
    params.publicClient.getGasPrice(),
    params.intentEngine.getTokenPrice(params.chainId, NATIVE_TOKEN_ADDRESS),
  ]);
  return { gasPriceWei, nativePriceUsd: nativeToken.priceUSD };
}

function mergeApprovalTransactions(
  approvals: readonly PreparedTransaction[],
): PreparedTransaction[] {
  const merged = new Map<
    string,
    { requirement: ApprovalRequirement; chainId: number; gasLimit?: string }
  >();

  for (const approval of approvals) {
    const requirement = approvalRequirementFromTx(approval);
    const key = `${approval.chainId}:${requirement.tokenAddress.toLowerCase()}:${requirement.spenderAddress.toLowerCase()}`;
    const current = merged.get(key);
    merged.set(key, {
      requirement: {
        ...requirement,
        amount: (current?.requirement.amount ?? 0n) + requirement.amount,
      },
      chainId: approval.chainId,
      ...(approval.gasLimit ? { gasLimit: approval.gasLimit } : {}),
    });
  }

  return [...merged.values()].map(({ requirement, chainId, gasLimit }) =>
    buildApproveTx({
      token: requirement.tokenAddress,
      spender: requirement.spenderAddress,
      amount: requirement.amount.toString(),
      chainId,
      ...(gasLimit ? { gasLimit } : {}),
    }),
  );
}

type StrategyAllocationId = StrategyDepositPlan['allocations'][number]['id'];

function withStrategyAllocation(
  transaction: PreparedTransaction,
  allocationId: StrategyAllocationId,
): PreparedTransaction {
  const route = transaction.meta.route;
  const routeRecord =
    typeof route === 'object' && route !== null && !Array.isArray(route)
      ? (route as Record<string, unknown>)
      : {};

  return {
    ...transaction,
    meta: {
      ...transaction.meta,
      route: {
        ...routeRecord,
        ...(Object.keys(routeRecord).length === 0 && route !== undefined
          ? { originalRoute: route }
          : {}),
        strategyAllocationId: allocationId,
      },
    },
  };
}

function approvalTransaction(
  approval: TransactionQuote['approval'],
  chainId: number,
): PreparedTransaction | null {
  if (!approval) {
    return null;
  }

  return buildApproveTx({
    token: approval.tokenAddress,
    spender: approval.spenderAddress,
    amount: approval.amount,
    chainId,
    gasLimit: GMX_V2_GAS_ESTIMATES.approve,
  });
}

async function buildStrategyDeposit(params: {
  request: Extract<PlanOrchestrationDepositRequest, { kind: 'strategy' }>;
  intentEngine: PlanOrchestrationServiceDeps['intentEngine'];
  publicClients: DepositPublicClients;
  simulation: PlanSimulationDeps | undefined;
}): Promise<StrategyDepositPlan> {
  const { request, intentEngine, publicClients, simulation } = params;
  if (!intentEngine.buildSupply || !intentEngine.getTokenPrice) {
    throw new Error('Strategy planning dependencies are not configured');
  }
  const userAddress = request.userAddress as Address;
  const baseSource = request.fundingSources[0];
  const arbitrumSource = request.fundingSources[1];
  const totalUsd6 = BigInt(request.totalUsd6);
  const baseUsd6 = (totalUsd6 * 4_000n) / 10_000n;
  const btcUsd6 = (totalUsd6 * 3_000n) / 10_000n;
  const ethUsd6 = totalUsd6 - baseUsd6 - btcUsd6;

  const [baseToken, arbitrumToken] = await Promise.all([
    intentEngine.getTokenPrice(baseSource.chainId, baseSource.fromToken),
    intentEngine.getTokenPrice(
      arbitrumSource.chainId,
      arbitrumSource.fromToken,
    ),
  ]);
  const baseAmount = tokenAmountFromUsd({
    usd6: baseUsd6,
    decimals: baseToken.decimals,
    priceUsd: baseToken.priceUSD,
  });
  const btcAmount = tokenAmountFromUsd({
    usd6: btcUsd6,
    decimals: arbitrumToken.decimals,
    priceUsd: arbitrumToken.priceUSD,
  });
  const ethAmount = tokenAmountFromUsd({
    usd6: ethUsd6,
    decimals: arbitrumToken.decimals,
    priceUsd: arbitrumToken.priceUSD,
  });

  const baseClient = publicClientFor(
    publicClients,
    SUPPORTED_DEPOSIT_CHAINS.BASE,
  );
  const arbitrumClient = publicClientFor(
    publicClients,
    SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
  );
  const morphoVault =
    MORPHO_VAULTS[SUPPORTED_DEPOSIT_CHAINS.BASE].MOONWELL_USDC;

  const buildBaseMorphoPlan = async () => {
    const requiresSwap =
      baseSource.fromToken.toLowerCase() !== BASE_USDC_ADDRESS.toLowerCase();
    if (requiresSwap && !intentEngine.buildSwap) {
      throw new Error('Strategy swap planning dependency is not configured');
    }

    const swapQuote = requiresSwap
      ? await intentEngine.buildSwap!({
          type: 'SWAP',
          chainId: SUPPORTED_DEPOSIT_CHAINS.BASE,
          fromAddress: userAddress,
          fromToken: baseSource.fromToken,
          toToken: BASE_USDC_ADDRESS,
          fromAmount: baseAmount,
        })
      : null;
    const depositAmount = swapQuote?.estimate.toAmountMin ?? baseAmount;
    const supplyQuote = await intentEngine.buildSupply!(
      {
        type: 'SUPPLY',
        chainId: SUPPORTED_DEPOSIT_CHAINS.BASE,
        fromAddress: userAddress,
        fromToken: BASE_USDC_ADDRESS,
        fromAmount: depositAmount,
        vaultAddress: morphoVault,
        protocol: 'morpho',
      },
      baseClient,
    );

    return { swapQuote, supplyQuote, depositAmount };
  };

  const [basePlan, btcPlan, ethPlan] = await Promise.all([
    buildBaseMorphoPlan(),
    intentEngine.buildGmxV2Supply({
      marketKey: 'btc-usdc',
      fromToken: arbitrumSource.fromToken as Address,
      fromAmount: btcAmount,
      userAddress,
    }),
    intentEngine.buildGmxV2Supply({
      marketKey: 'eth-usdc',
      fromToken: arbitrumSource.fromToken as Address,
      fromAmount: ethAmount,
      userAddress,
    }),
  ]);
  const { swapQuote: baseSwapQuote, supplyQuote: morphoQuote } = basePlan;

  const baseApprovalCandidates = [
    approvalTransaction(baseSwapQuote?.approval, SUPPORTED_DEPOSIT_CHAINS.BASE),
    buildApproveTx({
      token: BASE_USDC_ADDRESS,
      spender: morphoVault,
      amount: basePlan.depositAmount,
      chainId: SUPPORTED_DEPOSIT_CHAINS.BASE,
      gasLimit: GMX_V2_GAS_ESTIMATES.approve,
    }),
  ].filter(
    (transaction): transaction is PreparedTransaction => transaction !== null,
  );
  const baseApprovals = await filterNeededApprovals({
    approvals: mergeApprovalTransactions(baseApprovalCandidates),
    owner: userAddress,
    publicClient: baseClient,
  });

  const mergedArbitrumApprovals = mergeApprovalTransactions([
    ...btcPlan.approvals,
    ...ethPlan.approvals,
  ]);
  const arbitrumApprovals = await filterNeededApprovals({
    approvals: mergedArbitrumApprovals,
    owner: userAddress,
    publicClient: arbitrumClient,
  });
  const baseCalls = [
    ...(baseSwapQuote
      ? [withStrategyAllocation(baseSwapQuote.transaction, 'morpho-base-usdc')]
      : []),
    withStrategyAllocation(morphoQuote.transaction, 'morpho-base-usdc'),
  ];
  const arbitrumCalls = [
    ...btcPlan.steps.map((transaction) =>
      withStrategyAllocation(transaction, 'gmx-btc-usdc'),
    ),
    ...ethPlan.steps.map((transaction) =>
      withStrategyAllocation(transaction, 'gmx-eth-usdc'),
    ),
  ];
  const arbitrumAmount = (BigInt(btcAmount) + BigInt(ethAmount)).toString();
  const [baseGasPricing, arbitrumGasPricing] = await Promise.all([
    getChainGasPricing({
      intentEngine,
      publicClient: baseClient,
      chainId: SUPPORTED_DEPOSIT_CHAINS.BASE,
    }),
    getChainGasPricing({
      intentEngine,
      publicClient: arbitrumClient,
      chainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
    }),
  ]);
  const sharedApprovalGas = transactionGasUnits(arbitrumApprovals);
  const btcGasUnits =
    transactionGasUnits(btcPlan.steps) + sharedApprovalGas / 2n;
  const ethGasUnits =
    transactionGasUnits(ethPlan.steps) +
    (sharedApprovalGas - sharedApprovalGas / 2n);
  const btcGasUsd = gasUsdFromUnits({
    gasUnits: btcGasUnits,
    ...arbitrumGasPricing,
  });
  const ethGasUsd = gasUsdFromUnits({
    gasUnits: ethGasUnits,
    ...arbitrumGasPricing,
  });
  const arbitrumGasUsd = sumGasUsd([btcGasUsd, ethGasUsd]);
  const baseGasUsd = gasUsdFromUnits({
    gasUnits: transactionGasUnits([...baseApprovals, ...baseCalls]),
    ...baseGasPricing,
  });
  const baseDurationSec =
    (baseSwapQuote?.estimate.executionDuration ?? 0) +
    morphoQuote.estimate.executionDuration;

  const baseGroup = {
    id: 'base-morpho' as const,
    chainId: SUPPORTED_DEPOSIT_CHAINS.BASE,
    fromToken: baseSource.fromToken,
    fromAmount: baseAmount,
    approvals: baseApprovals,
    calls: baseCalls,
    allocationIds: ['morpho-base-usdc'] as const,
    gasUsd: baseGasUsd,
  };
  const arbitrumGroup = {
    id: 'arbitrum-gmx' as const,
    chainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
    fromToken: arbitrumSource.fromToken,
    fromAmount: arbitrumAmount,
    approvals: arbitrumApprovals,
    calls: arbitrumCalls,
    allocationIds: ['gmx-btc-usdc', 'gmx-eth-usdc'] as const,
    gasUsd: arbitrumGasUsd,
  };

  await Promise.all([
    assertPlanSafety({
      plan: { ...baseGroup, sourceChainId: baseGroup.chainId },
      userAddress: request.userAddress,
      intent: {
        fromToken: baseGroup.fromToken,
        fromAmount: baseGroup.fromAmount,
      },
      simulation,
    }),
    assertPlanSafety({
      plan: { ...arbitrumGroup, sourceChainId: arbitrumGroup.chainId },
      userAddress: request.userAddress,
      intent: {
        fromToken: arbitrumGroup.fromToken,
        fromAmount: arbitrumGroup.fromAmount,
      },
      simulation,
    }),
  ]);

  return StrategyDepositPlanSchema.parse({
    kind: 'strategy',
    strategyId: STRATEGY_DEPOSIT_ID,
    totalUsd6: request.totalUsd6,
    allocations: [
      {
        id: 'morpho-base-usdc',
        label: 'Morpho Moonwell USDC',
        weightBps: 4_000,
        chainId: SUPPORTED_DEPOSIT_CHAINS.BASE,
        protocol: 'morpho',
        fromToken: baseSource.fromToken,
        fromAmount: baseAmount,
        toToken: BASE_USDC_ADDRESS,
        toAmountMin: morphoQuote.estimate.toAmountMin,
        gasUsd: baseGasUsd,
        durationSec: baseDurationSec,
      },
      {
        id: 'gmx-btc-usdc',
        label: 'GMX BTC/USDC',
        weightBps: 3_000,
        chainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
        protocol: 'gmx-v2',
        marketKey: 'btc-usdc',
        fromToken: arbitrumSource.fromToken,
        fromAmount: btcAmount,
        toToken: btcPlan.market.marketToken,
        toAmountMin: btcPlan.minMarketTokens,
        gasUsd: btcGasUsd,
        durationSec: 60,
      },
      {
        id: 'gmx-eth-usdc',
        label: 'GMX ETH/USDC',
        weightBps: 3_000,
        chainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
        protocol: 'gmx-v2',
        marketKey: 'eth-usdc',
        fromToken: arbitrumSource.fromToken,
        fromAmount: ethAmount,
        toToken: ethPlan.market.marketToken,
        toAmountMin: ethPlan.minMarketTokens,
        gasUsd: ethGasUsd,
        durationSec: 60,
      },
    ],
    executionGroups: [baseGroup, arbitrumGroup],
    checkpoints: [
      {
        kind: 'mock-bridge',
        id: 'base-to-arbitrum',
        fromChainId: SUPPORTED_DEPOSIT_CHAINS.BASE,
        toChainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
        afterGroupId: 'base-morpho',
        beforeGroupId: 'arbitrum-gmx',
        amountUsd6: (btcUsd6 + ethUsd6).toString(),
        disclosure:
          "Mock bridge only — no funds move. Arbitrum steps use the connected wallet's existing balance.",
      },
    ],
    totalGasUsd: sumGasUsd([baseGroup.gasUsd, arbitrumGroup.gasUsd]),
  });
}

export function createPlanOrchestrationService({
  adapter,
  composeDeposit: compose = composeDeposit,
  defaultSplit,
  hyperliquidNetwork,
  intentEngine,
  publicClients,
  simulation,
}: PlanOrchestrationServiceDeps): PlanOrchestrationService {
  return {
    buildDeposit: (async (
      request: PlanOrchestrationDepositRequest,
    ): Promise<PlanOrchestrationDepositPlan> => {
      if (request.kind === 'invest') {
        // The env-configured default only applies to Base-source plans;
        // non-Base sources are destination re-quotes and default to
        // single-chain inside composeDeposit.
        const split =
          chainSplitFromRequest(request.split) ??
          (request.sourceChainId === BASE_CHAIN_ID ? defaultSplit : undefined);
        const plan = await compose(
          {
            userAddress: request.userAddress as Address,
            fromToken: request.fromToken as Address,
            fromAmount: request.fromAmount,
            sourceChainId: request.sourceChainId,
            ...(split ? { split } : {}),
          },
          {
            adapter,
            publicClients,
            ...(hyperliquidNetwork ? { hyperliquidNetwork } : {}),
          },
        );

        const parsed = DepositPlanSchema.parse(plan);
        await assertPlanSafety({
          plan: parsed,
          userAddress: request.userAddress,
          intent: {
            fromToken: request.fromToken,
            fromAmount: request.fromAmount,
          },
          simulation,
        });
        return parsed;
      }

      if (request.kind === 'strategy') {
        return buildStrategyDeposit({
          request,
          intentEngine,
          publicClients,
          simulation,
        });
      }

      const publicClient = publicClientFor(
        publicClients,
        GMX_V2_ARBITRUM_CHAIN_ID,
      );
      const userAddress = request.userAddress as Address;
      const gmxPlan = await intentEngine.buildGmxV2Supply({
        marketKey: request.marketKey,
        fromToken: GMX_V2_TOKENS.USDC.address,
        fromAmount: request.amount,
        userAddress,
      });
      const approvals = await filterNeededApprovals({
        approvals: gmxPlan.approvals,
        owner: userAddress,
        publicClient,
      });
      const gasPricing = await getChainGasPricing({
        intentEngine,
        publicClient,
        chainId: GMX_V2_ARBITRUM_CHAIN_ID,
      });
      const gasUsd = gasUsdFromUnits({
        gasUnits: transactionGasUnits([...approvals, ...gmxPlan.steps]),
        ...gasPricing,
      });

      return finalizePlan(
        DepositPlanSchema.parse({
          legs: [
            {
              chainId: GMX_V2_ARBITRUM_CHAIN_ID,
              kind: 'supply',
              protocol: 'gmx-v2',
              toToken: gmxPlan.market.marketToken,
              fromAmount: request.amount,
              toAmountMin: gmxPlan.minMarketTokens,
              gasUsd,
              durationSec: 60,
            },
          ],
          approvals,
          calls: gmxPlan.steps,
          totalGasUsd: gasUsd,
          sourceChainId: GMX_V2_ARBITRUM_CHAIN_ID,
        }),
        { userAddress: request.userAddress, simulation },
      );
    }) as PlanOrchestrationService['buildDeposit'],

    async buildWithdraw(request): Promise<WithdrawPlan> {
      if (request.kind === 'gmx-v2') {
        const publicClient = publicClientFor(
          publicClients,
          GMX_V2_ARBITRUM_CHAIN_ID,
        );
        const userAddress = request.userAddress as Address;
        const gmxPlan = await intentEngine.buildGmxV2Withdraw({
          marketKey: request.marketKey,
          gmAmount: request.gmAmount,
          userAddress,
        });
        const approvals = await filterNeededApprovals({
          approvals: gmxPlan.approvals,
          owner: userAddress,
          publicClient,
        });

        // GMX settles long+short asynchronously via the keeper; the leg's
        // toToken is the market's representative collateral token. No swap.
        return finalizePlan(
          WithdrawPlanSchema.parse({
            legs: [
              {
                chainId: GMX_V2_ARBITRUM_CHAIN_ID,
                kind: 'withdraw',
                protocol: 'gmx-v2',
                toToken: gmxPlan.market.collateralToken,
                fromAmount: request.gmAmount,
                toAmountMin: '0',
                gasUsd: '0',
                durationSec: 60,
              },
            ],
            approvals,
            calls: gmxPlan.steps,
            totalGasUsd: '0',
            sourceChainId: GMX_V2_ARBITRUM_CHAIN_ID,
          }),
          { userAddress: request.userAddress, simulation },
        );
      }

      const { chainId } = request;
      const publicClient = publicClientFor(publicClients, chainId);
      const userAddress = request.userAddress as Address;
      const plan = await intentEngine.buildWithdrawSwap(
        {
          vaultAddress: request.vaultAddress as Address,
          shareAmount: request.shareAmount,
          ...(request.toToken ? { toToken: request.toToken as Address } : {}),
          fromAddress: userAddress,
          chainId,
        },
        publicClient,
      );
      const approvals = await neededApprovalFromRequirement({
        approval: plan.approval,
        owner: userAddress,
        publicClient,
        chainId,
      });

      const legs: WithdrawPlan['legs'] = [
        {
          chainId,
          kind: 'withdraw',
          protocol: 'morpho',
          toToken: plan.assetToken,
          fromAmount: request.shareAmount,
          toAmountMin: plan.redeemAmount,
          gasUsd: '0',
          durationSec: 0,
        },
      ];
      // A second step means the redeemed asset is swapped into the chosen token.
      if (plan.steps.length > 1 && request.toToken) {
        legs.push({
          chainId,
          kind: 'swap',
          protocol: 'lifi',
          toToken: request.toToken,
          fromAmount: plan.redeemAmount,
          toAmountMin: plan.estimates.expectedOutput,
          gasUsd: plan.estimates.totalGasUsd,
          durationSec: plan.estimates.totalDuration,
        });
      }

      return finalizePlan(
        WithdrawPlanSchema.parse({
          legs,
          approvals,
          calls: plan.steps,
          totalGasUsd: plan.estimates.totalGasUsd,
          sourceChainId: chainId,
        }),
        { userAddress: request.userAddress, simulation },
      );
    },
  };
}
