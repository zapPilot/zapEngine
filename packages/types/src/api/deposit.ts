import { z } from 'zod';

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
export const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const NATIVE_TOKEN_ADDRESS =
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

/** Canonical USDC per supported source chain, for request validation. */
export const DEPOSIT_USDC_ADDRESSES: Record<number, string> = {
  [SUPPORTED_DEPOSIT_CHAINS.ETHEREUM]:
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  [SUPPORTED_DEPOSIT_CHAINS.BASE]: BASE_USDC_ADDRESS,
  [SUPPORTED_DEPOSIT_CHAINS.ARBITRUM]:
    '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
};

const decimalStringSchema = z.string().regex(/^\d+$/, {
  message: 'Expected a base-unit integer string',
});

export const AddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, {
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
 * Non-EVM Hyperliquid exchange action: deposit perp USDC into a vault (HLP).
 * Declarative only — the execution plane (frontend) adds the ms-timestamp
 * nonce, computes the L1-action hash / phantom-agent EIP-712 payload, signs
 * via the user's wallet, and POSTs to `signing.apiUrl` + '/exchange'. Amounts
 * are 6-decimal base-unit integers.
 */
export const HyperliquidVaultDepositStepSchema = z.object({
  kind: z.literal('hyperliquid-vault-deposit'),
  chainId: z.literal(HYPERCORE_CHAIN_ID),
  /** Index into plan.legs of the bridge leg this step waits on. */
  afterLegIndex: z.number().int().nonnegative(),
  amount: FollowUpAmountSchema,
  /** Planning-time estimate (the bridge leg's toAmountMin), display only. */
  expectedUsd: decimalStringSchema,
  /** Vault minimum deposit, enforced server-side and re-checked in the UI. */
  minDepositUsd: decimalStringSchema,
  action: z.object({
    type: z.literal('vaultTransfer'),
    vaultAddress: AddressSchema,
    isDeposit: z.literal(true),
  }),
  signing: z.object({
    scheme: z.literal('hyperliquid-l1-action'),
    hyperliquidChain: z.enum(['Mainnet', 'Testnet']),
    apiUrl: z.string(),
  }),
  /** HLP enforces a withdrawal lock (days) after the latest deposit — UI disclosure. */
  lockupDays: z.number().int().nonnegative(),
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
  const fromToken = value.fromToken.toLowerCase();
  if (
    fromToken !== usdc?.toLowerCase() &&
    fromToken !== NATIVE_TOKEN_ADDRESS.toLowerCase()
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
      kind: z.literal('gmx-v2'),
      marketKey: z.enum(['btc-btc', 'eth-eth', 'btc-usdc', 'eth-usdc']),
      amount: decimalStringSchema,
      userAddress: AddressSchema,
    }),
  ])
  .superRefine((value, ctx) => {
    if (value.kind !== 'invest') {
      return;
    }

    addInvestDepositValidationIssues(value, ctx);
  });

export type PreparedTransaction = z.infer<typeof PreparedTransactionSchema>;
export type DepositLeg = z.infer<typeof DepositLegSchema>;
export type FollowUpAmount = z.infer<typeof FollowUpAmountSchema>;
export type HyperliquidVaultDepositStep = z.infer<
  typeof HyperliquidVaultDepositStepSchema
>;
export type DestinationReplanStep = z.infer<typeof DestinationReplanStepSchema>;
export type DepositFollowUp = z.infer<typeof DepositFollowUpSchema>;
export type DepositPlan = z.infer<typeof DepositPlanSchema>;
export type ChainSplit = z.infer<typeof ChainSplitSchema>;
export type DepositRequest = z.infer<typeof DepositRequestSchema>;
export type PlanOrchestrationDepositRequest = z.infer<
  typeof PlanOrchestrationDepositRequestSchema
>;
