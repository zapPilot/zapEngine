import { z } from 'zod';

import { WALLET_ADDRESS_REGEX } from '../shared/wallet.js';

const HexDataSchema = z
  .string()
  .regex(/^0x(?:[0-9a-fA-F]{2})*$/, 'data must be an even-length hex string')
  .max(100_002);

const HexQuantitySchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]+$/, 'value must be a hex quantity');
const Bytes32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

export const PrivyAtomicBatchCallSchema = z.object({
  to: z.string().regex(WALLET_ADDRESS_REGEX, 'Invalid call target address'),
  data: HexDataSchema.optional(),
  value: HexQuantitySchema.optional(),
});

export const PrivyAtomicBatchPayloadSchema = z.object({
  walletId: z.string().min(1),
  walletAddress: z
    .string()
    .regex(WALLET_ADDRESS_REGEX, 'Invalid Privy wallet address'),
  chainId: z.union([z.literal(8453), z.literal(42161)]),
  calls: z.array(PrivyAtomicBatchCallSchema).min(1),
  idempotencyKey: z.string().min(1).max(128),
});

export const PrivyAtomicBatchAuthorizationResponseSchema = z.object({
  authorizationPayload: z.string().min(1),
  requestExpiry: z.number().int().positive(),
});

export const PrivyAtomicBatchRequestSchema =
  PrivyAtomicBatchPayloadSchema.extend({
    authorizationSignature: z.string().min(1).max(4096),
    requestExpiry: z.number().int().positive(),
  });

export const PrivyAtomicBatchResponseSchema = z.object({
  transactionId: z.string().min(1),
  caip2: z.string().regex(/^eip155:\d+$/),
  transactionHash: Bytes32Schema.optional(),
});

export const PrivyPrepareSendCallsRequestSchema =
  PrivyAtomicBatchPayloadSchema.extend({});

const DecimalIntegerSchema = z.string().regex(/^\d+$/);
const DecimalAmountSchema = z.string().regex(/^\d+(?:\.\d+)?$/);

export const PrivySimulationTokenSchema = z
  .object({
    address: z.string().regex(WALLET_ADDRESS_REGEX).nullable(),
    symbol: z.string().min(1),
    name: z.string().min(1),
    decimals: z.number().int().min(0).max(255),
    logoUrl: z.url().nullable(),
  })
  .strict();

export const PrivySimulationCallSchema = z
  .object({
    index: z.number().int().nonnegative(),
    to: z.string().regex(WALLET_ADDRESS_REGEX),
    data: HexDataSchema,
    value: DecimalIntegerSchema,
    method: z.string().min(1).nullable(),
    status: z.enum(['succeeded', 'failed', 'skipped']),
    gasUsed: DecimalIntegerSchema.nullable(),
    error: z.string().min(1).nullable(),
    contractVerified: z.boolean(),
  })
  .strict();

export const PrivySimulationAssetChangeSchema = z
  .object({
    callIndex: z.number().int().nonnegative(),
    direction: z.enum(['in', 'out']),
    type: z.string().min(1),
    from: z.string().regex(WALLET_ADDRESS_REGEX).nullable(),
    to: z.string().regex(WALLET_ADDRESS_REGEX).nullable(),
    token: PrivySimulationTokenSchema,
    rawAmount: DecimalIntegerSchema,
    amount: DecimalAmountSchema,
  })
  .strict();

export const PrivySimulationApprovalSchema = z
  .object({
    callIndex: z.number().int().nonnegative(),
    owner: z.string().regex(WALLET_ADDRESS_REGEX),
    spender: z.string().regex(WALLET_ADDRESS_REGEX),
    token: PrivySimulationTokenSchema,
    rawAmount: DecimalIntegerSchema,
    amount: DecimalAmountSchema,
    unlimited: z.boolean(),
    simulatedSpendRaw: DecimalIntegerSchema,
    exceedsSimulatedSpend: z.boolean(),
  })
  .strict();

export const PrivySimulationContractSchema = z
  .object({
    address: z.string().regex(WALLET_ADDRESS_REGEX),
    name: z.string().min(1).nullable(),
    verified: z.boolean(),
    callIndexes: z.array(z.number().int().nonnegative()),
  })
  .strict();

export const PrivySimulationWarningCodeSchema = z.enum([
  'UNVERIFIED_CONTRACT',
  'UNDECODED_METHOD',
  'UNLIMITED_APPROVAL',
  'APPROVAL_EXCEEDS_SIMULATED_SPEND',
]);

export const PrivySimulationWarningSchema = z
  .object({
    code: PrivySimulationWarningCodeSchema,
    message: z.string().min(1),
    callIndex: z.number().int().nonnegative().optional(),
    address: z.string().regex(WALLET_ADDRESS_REGEX).optional(),
  })
  .strict();

const PrivySimulationReviewEvidenceShape = {
  chainId: z.union([z.literal(8453), z.literal(42161)]),
  walletAddress: z.string().regex(WALLET_ADDRESS_REGEX),
  calls: z.array(PrivySimulationCallSchema).min(1),
  assetChanges: z.array(PrivySimulationAssetChangeSchema),
  approvals: z.array(PrivySimulationApprovalSchema),
  contracts: z.array(PrivySimulationContractSchema),
  warnings: z.array(PrivySimulationWarningSchema),
  blockNumber: z.number().int().nonnegative().nullable(),
  callGas: DecimalIntegerSchema,
  simulationIds: z.array(z.string().min(1)),
  shareUrls: z.array(z.url()),
  simulationFingerprint: Bytes32Schema,
  riskHash: Bytes32Schema,
};

const PrivySimulationSigningShape = {
  previewId: z.string().min(1),
  batchHash: Bytes32Schema,
  typedDataPayload: z.record(z.string(), z.unknown()),
  expiresAt: z.number().int().positive(),
  authorizationPayload: z.string().min(1),
  requestExpiry: z.number().int().positive(),
};

export const PrivyPassedSimulationPreviewSchema = z
  .object({
    status: z.literal('passed'),
    ...PrivySimulationReviewEvidenceShape,
    warnings: z.array(PrivySimulationWarningSchema).max(0),
    ...PrivySimulationSigningShape,
  })
  .strict();

export const PrivyWarningSimulationPreviewSchema = z
  .object({
    status: z.literal('warning'),
    ...PrivySimulationReviewEvidenceShape,
    warnings: z.array(PrivySimulationWarningSchema).min(1),
    ...PrivySimulationSigningShape,
  })
  .strict();

export const PrivyFailedSimulationPreviewSchema = z
  .object({
    status: z.literal('failed'),
    ...PrivySimulationReviewEvidenceShape,
    failureReason: z.string().min(1),
  })
  .strict();

export const PrivyUnavailableSimulationPreviewSchema = z
  .object({
    status: z.literal('unavailable'),
    ...PrivySimulationReviewEvidenceShape,
    unavailableReason: z.string().min(1),
  })
  .strict();

export const PrivyPrepareSendCallsResponseSchema = z.discriminatedUnion(
  'status',
  [
    PrivyPassedSimulationPreviewSchema,
    PrivyWarningSimulationPreviewSchema,
    PrivyFailedSimulationPreviewSchema,
    PrivyUnavailableSimulationPreviewSchema,
  ],
);

export const PrivyConfirmSendCallsRequestSchema = z.object({
  previewId: z.string().min(1),
  userSignature: z.string().min(1),
  authorizationSignature: z.string().min(1),
  acknowledgedRiskHash: Bytes32Schema.optional(),
});

export const PrivyConfirmSendCallsResponseSchema = z.discriminatedUnion(
  'status',
  [
    PrivyAtomicBatchResponseSchema.extend({
      status: z.literal('submitted'),
    }).strict(),
    z
      .object({
        status: z.literal('review'),
        preview: PrivyPrepareSendCallsResponseSchema,
      })
      .strict(),
  ],
);

export type PrivyAtomicBatchCall = z.infer<typeof PrivyAtomicBatchCallSchema>;
export type PrivyAtomicBatchPayload = z.infer<
  typeof PrivyAtomicBatchPayloadSchema
>;
export type PrivyAtomicBatchAuthorizationResponse = z.infer<
  typeof PrivyAtomicBatchAuthorizationResponseSchema
>;
export type PrivyAtomicBatchRequest = z.infer<
  typeof PrivyAtomicBatchRequestSchema
>;
export type PrivyAtomicBatchResponse = z.infer<
  typeof PrivyAtomicBatchResponseSchema
>;

export type PrivyPrepareSendCallsRequest = z.infer<
  typeof PrivyPrepareSendCallsRequestSchema
>;
export type PrivyPrepareSendCallsResponse = z.infer<
  typeof PrivyPrepareSendCallsResponseSchema
>;
export type PrivySimulationToken = z.infer<typeof PrivySimulationTokenSchema>;
export type PrivySimulationCall = z.infer<typeof PrivySimulationCallSchema>;
export type PrivySimulationAssetChange = z.infer<
  typeof PrivySimulationAssetChangeSchema
>;
export type PrivySimulationApproval = z.infer<
  typeof PrivySimulationApprovalSchema
>;
export type PrivySimulationContract = z.infer<
  typeof PrivySimulationContractSchema
>;
export type PrivySimulationWarningCode = z.infer<
  typeof PrivySimulationWarningCodeSchema
>;
export type PrivySimulationWarning = z.infer<
  typeof PrivySimulationWarningSchema
>;
export type PrivyConfirmSendCallsRequest = z.infer<
  typeof PrivyConfirmSendCallsRequestSchema
>;
export type PrivyConfirmSendCallsResponse = z.infer<
  typeof PrivyConfirmSendCallsResponseSchema
>;
