import { z } from 'zod';

import { AddressSchema, HexDataSchema } from './deposit.js';

export const SimulationDecimalIntegerSchema = z.string().regex(/^\d+$/);
export const SimulationDecimalAmountSchema = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/);
export const SimulationBytes32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const SimulationCallDataSchema = HexDataSchema.max(100_002);

export const SimulationTokenSchema = z
  .object({
    address: AddressSchema.nullable(),
    symbol: z.string().min(1),
    name: z.string().min(1),
    decimals: z.number().int().min(0).max(255),
    logoUrl: z.url().nullable(),
  })
  .strict();

export const SimulationCallSchema = z
  .object({
    index: z.number().int().nonnegative(),
    to: AddressSchema,
    data: SimulationCallDataSchema,
    value: SimulationDecimalIntegerSchema,
    method: z.string().min(1).nullable(),
    status: z.enum(['succeeded', 'failed', 'skipped']),
    gasUsed: SimulationDecimalIntegerSchema.nullable(),
    error: z.string().min(1).nullable(),
  })
  .strict();

export const SimulationAssetChangeSchema = z
  .object({
    callIndex: z.number().int().nonnegative(),
    direction: z.enum(['in', 'out']),
    type: z.string().min(1),
    from: AddressSchema.nullable(),
    to: AddressSchema.nullable(),
    token: SimulationTokenSchema,
    rawAmount: SimulationDecimalIntegerSchema,
    amount: SimulationDecimalAmountSchema,
  })
  .strict();

export const SimulationApprovalSchema = z
  .object({
    callIndex: z.number().int().nonnegative(),
    owner: AddressSchema,
    spender: AddressSchema,
    token: SimulationTokenSchema,
    rawAmount: SimulationDecimalIntegerSchema,
    amount: SimulationDecimalAmountSchema,
    unlimited: z.boolean(),
    simulatedSpendRaw: SimulationDecimalIntegerSchema,
    exceedsSimulatedSpend: z.boolean(),
  })
  .strict();

export const SimulationContractSchema = z
  .object({
    address: AddressSchema,
    name: z.string().min(1).nullable(),
    callIndexes: z.array(z.number().int().nonnegative()),
  })
  .strict();

export const SimulationWarningCodeSchema = z.enum([
  'UNDECODED_METHOD',
  'UNLIMITED_APPROVAL',
  'APPROVAL_EXCEEDS_SIMULATED_SPEND',
]);

export const SimulationWarningSchema = z
  .object({
    code: SimulationWarningCodeSchema,
    message: z.string().min(1),
    callIndex: z.number().int().nonnegative().optional(),
    address: AddressSchema.optional(),
  })
  .strict();

export const SimulationReviewEvidenceShape = {
  chainId: z.number().int().positive(),
  walletAddress: AddressSchema,
  calls: z.array(SimulationCallSchema),
  assetChanges: z.array(SimulationAssetChangeSchema),
  approvals: z.array(SimulationApprovalSchema),
  contracts: z.array(SimulationContractSchema),
  warnings: z.array(SimulationWarningSchema),
  blockNumber: z.number().int().nonnegative().nullable(),
  callGas: SimulationDecimalIntegerSchema,
  simulationIds: z.array(z.string().min(1)),
  shareUrls: z.array(z.url()),
  simulationFingerprint: SimulationBytes32Schema,
  riskHash: SimulationBytes32Schema,
};
