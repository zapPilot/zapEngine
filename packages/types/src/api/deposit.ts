import { z } from 'zod';

import {
  CANONICAL_TOKEN_ADDRESSES,
  NATIVE_TOKEN_ADDRESS,
} from '../shared/tokens.js';
import { WALLET_ADDRESS_REGEX, equalsAddress } from '../shared/wallet.js';

export { NATIVE_TOKEN_ADDRESS } from '../shared/tokens.js';

export const SUPPORTED_DEPOSIT_CHAINS = {
  ETHEREUM: 1,
  BASE: 8453,
  ARBITRUM: 42161,
} as const;

/**
 * LI.FI's chain id for HyperCore (key `hpl`) — Hyperliquid's exchange layer.
 * A valid bridge *destination* (funds arrive as perps USDC in the user's
 * Hyperliquid account) but not an EVM execution chain: no PreparedTransaction
 * ever carries it as a source, and it is never a deposit source chain.
 */
export const HYPERCORE_CHAIN_ID = 1337;

export const BASE_CHAIN_ID = SUPPORTED_DEPOSIT_CHAINS.BASE;
export const STRATEGY_DEPOSIT_ID = 'zap-morpho-gmx-v1' as const;
/**
 * Minimum strategy deposit ($10, 6-decimal USD). The two GMX legs each pay a
 * fixed 0.001 ETH keeper execution fee and the builders reject amounts too
 * small to keep a slippage buffer — below this floor a plan either fails or
 * is uneconomical. Shared by the request schema and the app's amount screen.
 */
export const STRATEGY_MIN_DEPOSIT_USD6 = 10_000_000n;

/**
 * Hyperliquid's own HLP vault minimum ($10, 6-decimal USD). Owned here rather
 * than in the planner so the request schema can reject an undersized deposit
 * before any plan is built; `intent-engine` re-exports the string form.
 */
export const HLP_MIN_DEPOSIT_USD6 = 10_000_000n;
export const BASE_USDC_ADDRESS = CANONICAL_TOKEN_ADDRESSES[8453].USDC;

/** Canonical USDC per supported source chain, for request validation. */
export const DEPOSIT_USDC_ADDRESSES: Record<number, string> = {
  [SUPPORTED_DEPOSIT_CHAINS.ETHEREUM]: CANONICAL_TOKEN_ADDRESSES[1].USDC,
  [SUPPORTED_DEPOSIT_CHAINS.BASE]: BASE_USDC_ADDRESS,
  [SUPPORTED_DEPOSIT_CHAINS.ARBITRUM]: CANONICAL_TOKEN_ADDRESSES[42161].USDC,
};

/** Canonical USDT on chains where the wallet catalog currently supports it. */
export const DEPOSIT_USDT_ADDRESSES: Partial<Record<number, string>> = {
  [SUPPORTED_DEPOSIT_CHAINS.ETHEREUM]: CANONICAL_TOKEN_ADDRESSES[1].USDT,
  [SUPPORTED_DEPOSIT_CHAINS.ARBITRUM]: CANONICAL_TOKEN_ADDRESSES[42161].USDT,
};

const decimalStringSchema = z.string().regex(/^\d+$/, {
  message: 'Expected a base-unit integer string',
});

export const AddressSchema = z.string().regex(WALLET_ADDRESS_REGEX, {
  message: 'Expected an EVM address',
});

export const HexDataSchema = z.string().regex(/^0x([a-fA-F0-9]{2})*$/, {
  message: 'Expected hex data',
});

export const PreparedTransactionSchema = z.object({
  to: AddressSchema,
  data: HexDataSchema,
  value: decimalStringSchema,
  chainId: z.number().int().positive(),
  gasLimit: decimalStringSchema.optional(),
  meta: z
    .object({
      intentId: z.string().optional(),
      intentType: z.string(),
      estimatedGas: decimalStringSchema.optional(),
      estimatedDuration: z.number().optional(),
      route: z.unknown().optional(),
    })
    .passthrough(),
});

export const DepositLegSchema = z.object({
  chainId: z.number().int().positive(),
  kind: z.enum(['supply', 'bridge']),
  protocol: z.string().optional(),
  label: z.string().optional(),
  toToken: AddressSchema,
  fromAmount: decimalStringSchema,
  toAmountMin: decimalStringSchema,
  bridge: z.string().optional(),
  gasUsd: z.string(),
  durationSec: z.number().int().nonnegative(),
});

/** Where the executed amount comes from when a follow-up step runs. */
export const FollowUpAmountSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('bridge-output'),
    /** Index into plan.legs of the bridge leg whose received amount funds this step. */
    legIndex: z.number().int().nonnegative(),
  }),
  z.object({
    source: z.literal('fixed'),
    amount: decimalStringSchema,
  }),
]);

/**
 * Shared by every Hyperliquid exchange action. The execution plane (frontend)
 * adds the ms-timestamp nonce, computes the L1-action hash / phantom-agent
 * EIP-712 payload, signs via the user's wallet, and POSTs to
 * `apiUrl` + '/exchange'.
 */
export const HyperliquidSigningSchema = z.object({
  scheme: z.literal('hyperliquid-l1-action'),
  hyperliquidChain: z.enum(['Mainnet', 'Testnet']),
  apiUrl: z.string(),
});

/**
 * Non-EVM Hyperliquid exchange action: deposit perp USDC into a vault (HLP).
 * Declarative only. Amounts are 6-decimal base-unit integers.
 */
export const HyperliquidVaultDepositStepSchema = z.object({
  kind: z.literal('hyperliquid-vault-deposit'),
  chainId: z.literal(HYPERCORE_CHAIN_ID),
  /**
   * Index into plan.legs of the bridge leg this step waits on. Absent on the
   * spot-funded plan, which has no legs at all.
   */
  afterLegIndex: z.number().int().nonnegative().optional(),
  amount: FollowUpAmountSchema,
  /** Planning-time estimate (the bridge leg's toAmountMin), display only. */
  expectedUsd: decimalStringSchema.optional(),
  /** Vault minimum deposit, enforced server-side and re-checked in the UI. */
  minDepositUsd: decimalStringSchema,
  action: z.object({
    type: z.literal('vaultTransfer'),
    vaultAddress: AddressSchema,
    isDeposit: z.literal(true),
  }),
  signing: HyperliquidSigningSchema,
  /** HLP enforces a withdrawal lock (days) after the latest deposit — UI disclosure. */
  lockupDays: z.number().int().nonnegative(),
});

/**
 * Non-EVM Hyperliquid exchange action: move USDC between the spot and perp
 * accounts. Vault deposits debit perp, so spot-funded HLP deposits need this
 * first.
 */
export const HyperliquidUsdClassTransferStepSchema = z.object({
  kind: z.literal('hyperliquid-usd-class-transfer'),
  chainId: z.literal(HYPERCORE_CHAIN_ID),
  /** 6-decimal base units, matching every other amount in this contract. */
  amountUsd6: decimalStringSchema,
  action: z.object({
    type: z.literal('usdClassTransfer'),
    toPerp: z.literal(true),
    /**
     * DOLLARS — "1" means $1. This exchange action denominates its amount
     * differently from `vaultTransfer`, whose `usd` is 6-decimal base units;
     * passing base units here would inflate the transfer 1e6x.
     *
     * This is the full deposit. A client whose perp account is already
     * partially funded transfers only the outstanding shortfall, so the
     * signed amount can be smaller than this — never larger.
     */
    amountUsd: z.string().regex(/^\d+(\.\d{1,6})?$/, {
      message: 'Expected a dollar-denominated decimal string',
    }),
  }),
  signing: HyperliquidSigningSchema,
});

/**
 * Destination EVM chain follow-up: once the bridge lands, the frontend POSTs
 * `replanRequest` back to POST /plan-orchestration/deposit with `userAddress`
 * and the actually-received `fromAmount` filled in, keeping re-quotes
 * server-authoritative. Not emitted in v1 (no destination-chain vaults yet).
 */
export const DestinationReplanStepSchema = z.object({
  kind: z.literal('destination-replan'),
  chainId: z.number().int().positive(),
  afterLegIndex: z.number().int().nonnegative(),
  amount: FollowUpAmountSchema,
  replanRequest: z.object({
    kind: z.literal('invest'),
    fromToken: AddressSchema,
    sourceChainId: z.number().int().positive(),
  }),
});

export const DepositFollowUpSchema = z.discriminatedUnion('kind', [
  HyperliquidVaultDepositStepSchema,
  DestinationReplanStepSchema,
]);

export const DepositPlanSchema = z.object({
  legs: z.array(DepositLegSchema),
  approvals: z.array(PreparedTransactionSchema),
  calls: z.array(PreparedTransactionSchema),
  /**
   * Post-bridge steps executed outside the source-chain batch (one wizard
   * click each). Optional and omitted when empty so existing plan payloads
   * stay byte-identical. Never mirrored in `legs`/`calls` — those keep their
   * 1:1 index correlation for the source-chain batch.
   */
  followUps: z.array(DepositFollowUpSchema).optional(),
  totalGasUsd: z.string(),
  sourceChainId: z.number().int().positive(),
});

/**
 * Spot-funded HLP deposit. Deliberately NOT a `DepositPlan`: there is no
 * bridge, no EVM transaction, and no gas, so an empty `legs`/`calls` plan
 * would have to claim a source chain it does not have and would trip the
 * client's empty-batch guard. Both steps are gasless wallet signatures.
 */
export const HlpSpotDepositPlanSchema = z.object({
  kind: z.literal('hlp-spot-deposit'),
  /** Marks this plan as bypassing reviewed-batch (EVM) execution entirely. */
  execution: z.literal('hypercore-signatures'),
  amountUsd6: decimalStringSchema,
  minDepositUsd: decimalStringSchema,
  lockupDays: z.number().int().nonnegative(),
  /**
   * Ordered and separate rather than merged: the two signatures fail
   * independently, and the spot-to-perp half can already be done when the
   * user returns, so the UI has to address them one at a time.
   */
  steps: z.tuple([
    HyperliquidUsdClassTransferStepSchema,
    HyperliquidVaultDepositStepSchema,
  ]),
});

export const StrategyAllocationSchema = z.object({
  id: z.enum(['morpho-base-usdc', 'gmx-btc-usdc', 'gmx-eth-usdc']),
  label: z.string(),
  weightBps: z.number().int().positive().max(10_000),
  chainId: z.union([
    z.literal(SUPPORTED_DEPOSIT_CHAINS.BASE),
    z.literal(SUPPORTED_DEPOSIT_CHAINS.ARBITRUM),
  ]),
  protocol: z.enum(['morpho', 'gmx-v2']),
  marketKey: z.enum(['btc-usdc', 'eth-usdc']).optional(),
  fromToken: AddressSchema,
  fromAmount: decimalStringSchema,
  toToken: AddressSchema,
  toAmountMin: decimalStringSchema,
  gasUsd: z.string(),
  durationSec: z.number().int().nonnegative(),
});

export const StrategyChainExecutionGroupSchema = z.object({
  id: z.enum(['base-morpho', 'arbitrum-gmx']),
  chainId: z.union([
    z.literal(SUPPORTED_DEPOSIT_CHAINS.BASE),
    z.literal(SUPPORTED_DEPOSIT_CHAINS.ARBITRUM),
  ]),
  fromToken: AddressSchema,
  fromAmount: decimalStringSchema,
  approvals: z.array(PreparedTransactionSchema),
  calls: z.array(PreparedTransactionSchema),
  allocationIds: z.array(StrategyAllocationSchema.shape.id).min(1),
  gasUsd: z.string(),
});

export const MockBridgeCheckpointSchema = z.object({
  kind: z.literal('mock-bridge'),
  id: z.literal('base-to-arbitrum'),
  fromChainId: z.literal(SUPPORTED_DEPOSIT_CHAINS.BASE),
  toChainId: z.literal(SUPPORTED_DEPOSIT_CHAINS.ARBITRUM),
  afterGroupId: z.literal('base-morpho'),
  beforeGroupId: z.literal('arbitrum-gmx'),
  amountUsd6: decimalStringSchema,
  disclosure: z.string(),
});

const STRATEGY_BASE_FUNDING_TOKENS = new Set(
  [BASE_USDC_ADDRESS, NATIVE_TOKEN_ADDRESS].map((address) =>
    address.toLowerCase(),
  ),
);
const STRATEGY_ARBITRUM_FUNDING_TOKENS = new Set(
  [
    DEPOSIT_USDC_ADDRESSES[SUPPORTED_DEPOSIT_CHAINS.ARBITRUM],
    DEPOSIT_USDT_ADDRESSES[SUPPORTED_DEPOSIT_CHAINS.ARBITRUM],
    NATIVE_TOKEN_ADDRESS,
  ]
    .filter((address): address is string => Boolean(address))
    .map((address) => address.toLowerCase()),
);

function hasIntentTypeSequence(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((intentType, index) => intentType === expected[index])
  );
}

export const StrategyDepositPlanSchema = z
  .object({
    kind: z.literal('strategy'),
    strategyId: z.literal(STRATEGY_DEPOSIT_ID),
    totalUsd6: decimalStringSchema,
    allocations: z.array(StrategyAllocationSchema).length(3),
    executionGroups: z.array(StrategyChainExecutionGroupSchema).length(2),
    checkpoints: z.array(MockBridgeCheckpointSchema).length(1),
    totalGasUsd: z.string(),
  })
  .superRefine((value, ctx) => {
    const fixedWeights = new Map([
      ['morpho-base-usdc', 4_000],
      ['gmx-btc-usdc', 3_000],
      ['gmx-eth-usdc', 3_000],
    ]);
    const seen = new Set<string>();
    for (const [index, allocation] of value.allocations.entries()) {
      if (seen.has(allocation.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate strategy allocation ${allocation.id}`,
          path: ['allocations', index, 'id'],
        });
      }
      seen.add(allocation.id);
      if (allocation.weightBps !== fixedWeights.get(allocation.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Unexpected fixed weight for ${allocation.id}`,
          path: ['allocations', index, 'weightBps'],
        });
      }
    }

    const expectedGroups = [
      {
        id: 'base-morpho',
        chainId: SUPPORTED_DEPOSIT_CHAINS.BASE,
        allocationIds: ['morpho-base-usdc'],
      },
      {
        id: 'arbitrum-gmx',
        chainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
        allocationIds: ['gmx-btc-usdc', 'gmx-eth-usdc'],
      },
    ] as const;

    for (const [index, expected] of expectedGroups.entries()) {
      const group = value.executionGroups[index];
      if (!group) {
        continue;
      }
      if (group.id !== expected.id || group.chainId !== expected.chainId) {
        ctx.addIssue({
          code: 'custom',
          message: `Strategy execution group ${index} must be ${expected.id} on chain ${expected.chainId}`,
          path: ['executionGroups', index],
        });
      }
      if (
        group.allocationIds.length !== expected.allocationIds.length ||
        group.allocationIds.some(
          (allocationId, allocationIndex) =>
            allocationId !== expected.allocationIds[allocationIndex],
        )
      ) {
        ctx.addIssue({
          code: 'custom',
          message: `Unexpected allocations for ${expected.id}`,
          path: ['executionGroups', index, 'allocationIds'],
        });
      }
      for (const [transactionIndex, transaction] of [
        ...group.approvals,
        ...group.calls,
      ].entries()) {
        if (transaction.chainId !== group.chainId) {
          ctx.addIssue({
            code: 'custom',
            message: 'Transaction chain must match its execution group',
            path: ['executionGroups', index, 'transactions', transactionIndex],
          });
        }
      }

      const fundingToken = group.fromToken.toLowerCase();
      const callTypes = group.calls.map(
        (transaction) => transaction.meta.intentType,
      );
      if (group.id === 'base-morpho') {
        if (!STRATEGY_BASE_FUNDING_TOKENS.has(fundingToken)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Base strategy funding must be canonical USDC or ETH',
            path: ['executionGroups', index, 'fromToken'],
          });
        }
        const expectedCallTypes = equalsAddress(
          group.fromToken,
          NATIVE_TOKEN_ADDRESS,
        )
          ? ['SWAP', 'SUPPLY']
          : ['SUPPLY'];
        if (!hasIntentTypeSequence(callTypes, expectedCallTypes)) {
          ctx.addIssue({
            code: 'custom',
            message:
              'Base strategy calls must expose each swap and Morpho supply separately',
            path: ['executionGroups', index, 'calls'],
          });
        }
      } else {
        if (!STRATEGY_ARBITRUM_FUNDING_TOKENS.has(fundingToken)) {
          ctx.addIssue({
            code: 'custom',
            message:
              'Arbitrum strategy funding must be canonical USDC, USDT, or ETH',
            path: ['executionGroups', index, 'fromToken'],
          });
        }
        const expectedCallTypes = equalsAddress(
          group.fromToken,
          DEPOSIT_USDC_ADDRESSES[SUPPORTED_DEPOSIT_CHAINS.ARBITRUM],
        )
          ? ['SUPPLY', 'SUPPLY']
          : ['SWAP', 'SUPPLY', 'SWAP', 'SUPPLY'];
        if (!hasIntentTypeSequence(callTypes, expectedCallTypes)) {
          ctx.addIssue({
            code: 'custom',
            message:
              'Arbitrum strategy calls must expose each swap and GMX supply separately',
            path: ['executionGroups', index, 'calls'],
          });
        }
      }
    }
  });

/**
 * Weights per destination chainId (JSON object keys are strings). Normalized
 * server-side; weights need not sum to 1.
 */
export const ChainSplitSchema = z.record(
  z.string().regex(/^\d+$/, { message: 'Expected a chainId key' }),
  z.number().positive(),
);

const supportedBaseDepositTokens = new Set(
  [BASE_USDC_ADDRESS, NATIVE_TOKEN_ADDRESS].map((address) =>
    address.toLowerCase(),
  ),
);

interface BaseDepositFields {
  readonly fromToken: string;
  readonly sourceChainId: number;
}

function addBaseDepositValidationIssues(
  value: BaseDepositFields,
  ctx: z.RefinementCtx,
): void {
  if (value.sourceChainId !== BASE_CHAIN_ID) {
    ctx.addIssue({
      code: 'custom',
      message: 'Deposit v1 supports Base only',
      path: ['sourceChainId'],
    });
  }

  if (!supportedBaseDepositTokens.has(value.fromToken.toLowerCase())) {
    ctx.addIssue({
      code: 'custom',
      message: 'Deposit v1 supports USDC and native ETH on Base only',
      path: ['fromToken'],
    });
  }
}

export const DepositRequestSchema = z
  .object({
    userAddress: AddressSchema,
    fromToken: AddressSchema,
    fromAmount: decimalStringSchema,
    sourceChainId: z.number().int().positive(),
  })
  .superRefine((value, ctx) => {
    addBaseDepositValidationIssues(value, ctx);
  });

const INVEST_SOURCE_CHAIN_IDS = new Set<number>(
  Object.values(SUPPORTED_DEPOSIT_CHAINS),
);
const SPLIT_ALLOWED_CHAIN_IDS = new Set<number>([
  ...Object.values(SUPPORTED_DEPOSIT_CHAINS),
  HYPERCORE_CHAIN_ID,
]);

interface InvestDepositFields extends BaseDepositFields {
  readonly split?: Record<string, number> | undefined;
}

// Chain-aware validation for the invest branch. Non-Base source chains exist
// only for the destination re-quote flow (bridge landed → re-quote with the
// actually-received amount), so their split must target the source chain alone.
function addInvestDepositValidationIssues(
  value: InvestDepositFields,
  ctx: z.RefinementCtx,
): void {
  if (!INVEST_SOURCE_CHAIN_IDS.has(value.sourceChainId)) {
    ctx.addIssue({
      code: 'custom',
      message: 'sourceChainId must be a supported EVM deposit chain',
      path: ['sourceChainId'],
    });
    return;
  }

  const usdc = DEPOSIT_USDC_ADDRESSES[value.sourceChainId];
  if (
    !equalsAddress(value.fromToken, usdc) &&
    !equalsAddress(value.fromToken, NATIVE_TOKEN_ADDRESS)
  ) {
    ctx.addIssue({
      code: 'custom',
      message: 'fromToken must be USDC or the native token on the source chain',
      path: ['fromToken'],
    });
  }

  if (!value.split) {
    return;
  }

  const splitChainIds = Object.keys(value.split).map(Number);
  for (const chainId of splitChainIds) {
    if (!SPLIT_ALLOWED_CHAIN_IDS.has(chainId)) {
      ctx.addIssue({
        code: 'custom',
        message: `Unsupported split chain ${chainId}`,
        path: ['split'],
      });
    }
  }

  if (
    value.sourceChainId !== BASE_CHAIN_ID &&
    splitChainIds.some((chainId) => chainId !== value.sourceChainId)
  ) {
    ctx.addIssue({
      code: 'custom',
      message:
        'Non-Base source chains support a single-chain split only (destination re-quote)',
      path: ['split'],
    });
  }
}

export const PlanOrchestrationDepositRequestSchema = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('invest'),
      userAddress: AddressSchema,
      fromToken: AddressSchema,
      fromAmount: decimalStringSchema,
      sourceChainId: z.number().int().positive(),
      split: ChainSplitSchema.optional(),
    }),
    z.object({
      kind: z.literal('hlp-spot-deposit'),
      userAddress: AddressSchema,
      /** Spot USDC to move into the vault, 6-decimal base units. */
      amountUsd6: decimalStringSchema.refine(
        (value) => BigInt(value) >= HLP_MIN_DEPOSIT_USD6,
        { message: 'HLP deposits require at least $10' },
      ),
    }),
    z.object({
      kind: z.literal('gmx-v2'),
      marketKey: z.enum(['btc-btc', 'eth-eth', 'btc-usdc', 'eth-usdc']),
      fromToken: AddressSchema,
      amount: decimalStringSchema,
      userAddress: AddressSchema,
    }),
    z.object({
      kind: z.literal('gmx-v2-basket'),
      fromToken: AddressSchema,
      amount: decimalStringSchema,
      userAddress: AddressSchema,
    }),
    z.object({
      kind: z.literal('strategy'),
      strategyId: z.literal(STRATEGY_DEPOSIT_ID),
      userAddress: AddressSchema,
      totalUsd6: decimalStringSchema.refine(
        (value) => BigInt(value) >= STRATEGY_MIN_DEPOSIT_USD6,
        { message: 'Strategy deposits require at least $10 total' },
      ),
      fundingSources: z.tuple([
        z.object({
          chainId: z.literal(SUPPORTED_DEPOSIT_CHAINS.BASE),
          fromToken: AddressSchema,
        }),
        z.object({
          chainId: z.literal(SUPPORTED_DEPOSIT_CHAINS.ARBITRUM),
          fromToken: AddressSchema,
        }),
      ]),
    }),
  ])
  .superRefine((value, ctx) => {
    if (value.kind === 'strategy') {
      for (const [index, source] of value.fundingSources.entries()) {
        const supported = [
          DEPOSIT_USDC_ADDRESSES[source.chainId],
          DEPOSIT_USDT_ADDRESSES[source.chainId],
          NATIVE_TOKEN_ADDRESS,
        ]
          .filter((address): address is string => Boolean(address))
          .map((address) => address.toLowerCase());
        if (!supported.includes(source.fromToken.toLowerCase())) {
          ctx.addIssue({
            code: 'custom',
            message:
              'Funding token must be canonical USDC, USDT, or native ETH',
            path: ['fundingSources', index, 'fromToken'],
          });
        }
      }
      return;
    }

    // Nothing chain-shaped to validate: sufficiency of the spot balance is a
    // client pre-flight gate, and the server has no HyperCore view to check it
    // against without a rate-limited third-party read that would be stale
    // by submission time anyway.
    if (value.kind === 'hlp-spot-deposit') {
      return;
    }

    if (value.kind === 'gmx-v2' || value.kind === 'gmx-v2-basket') {
      if (
        !STRATEGY_ARBITRUM_FUNDING_TOKENS.has(value.fromToken.toLowerCase())
      ) {
        ctx.addIssue({
          code: 'custom',
          message:
            'GMX v2 funding must be canonical Arbitrum USDC, USDT, or native ETH',
          path: ['fromToken'],
        });
      }
      return;
    }

    addInvestDepositValidationIssues(value, ctx);
  });

export type PreparedTransaction = z.infer<typeof PreparedTransactionSchema>;
export type DepositLeg = z.infer<typeof DepositLegSchema>;
export type HyperliquidVaultDepositStep = z.infer<
  typeof HyperliquidVaultDepositStepSchema
>;
export type DepositFollowUp = z.infer<typeof DepositFollowUpSchema>;
export type DepositPlan = z.infer<typeof DepositPlanSchema>;
export type StrategyAllocation = z.infer<typeof StrategyAllocationSchema>;
export type StrategyChainExecutionGroup = z.infer<
  typeof StrategyChainExecutionGroupSchema
>;
export type StrategyDepositPlan = z.infer<typeof StrategyDepositPlanSchema>;
export type HyperliquidUsdClassTransferStep = z.infer<
  typeof HyperliquidUsdClassTransferStepSchema
>;
export type HlpSpotDepositPlan = z.infer<typeof HlpSpotDepositPlanSchema>;
export type PlanOrchestrationDepositPlan =
  | DepositPlan
  | StrategyDepositPlan
  | HlpSpotDepositPlan;

/**
 * The plans that go through reviewed EVM batch execution. Excludes the
 * spot-funded HLP plan, which has no transactions to simulate, approve, or
 * send — it is two wallet signatures and is executed on its own path.
 */
export type ReviewedDepositPlan = Exclude<
  PlanOrchestrationDepositPlan,
  { kind: 'hlp-spot-deposit' }
>;

/** Requests that produce a reviewed EVM batch plan. */
export type ReviewedDepositRequest = Exclude<
  PlanOrchestrationDepositRequest,
  { kind: 'hlp-spot-deposit' }
>;

export const ReviewedDepositPlanSchema = z.union([
  DepositPlanSchema,
  StrategyDepositPlanSchema,
]);

export const PlanOrchestrationDepositPlanSchema = z.union([
  DepositPlanSchema,
  StrategyDepositPlanSchema,
  HlpSpotDepositPlanSchema,
]);
export type ChainSplit = z.infer<typeof ChainSplitSchema>;
export type DepositRequest = z.infer<typeof DepositRequestSchema>;
export type PlanOrchestrationDepositRequest = z.infer<
  typeof PlanOrchestrationDepositRequestSchema
>;
