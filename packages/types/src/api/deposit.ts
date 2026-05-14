import { z } from 'zod';

export const SUPPORTED_DEPOSIT_CHAINS = {
  ETHEREUM: 1,
  BASE: 8453,
  ARBITRUM: 42161,
} as const;

export const BASE_CHAIN_ID = SUPPORTED_DEPOSIT_CHAINS.BASE;
export const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const NATIVE_TOKEN_ADDRESS =
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

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

const typedDataFieldSchema = z.object({
  name: z.string(),
  type: z.string(),
});

export const PermitTypedDataSchema = z.object({
  domain: z.object({
    name: z.string(),
    version: z.string(),
    chainId: z.number().int().positive(),
    verifyingContract: AddressSchema,
  }),
  types: z
    .object({
      Permit: z.array(typedDataFieldSchema),
    })
    .passthrough(),
  primaryType: z.literal('Permit'),
  message: z.object({
    owner: AddressSchema,
    spender: AddressSchema,
    value: decimalStringSchema,
    nonce: decimalStringSchema,
    deadline: decimalStringSchema,
  }),
});

export const PermitRequestSchema = z.object({
  token: AddressSchema,
  owner: AddressSchema,
  spender: AddressSchema,
  value: decimalStringSchema,
  nonce: decimalStringSchema,
  deadline: decimalStringSchema,
  typedData: PermitTypedDataSchema,
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

export const DepositPlanSchema = z.object({
  legs: z.array(DepositLegSchema),
  approvals: z.array(PreparedTransactionSchema),
  permitRequest: PermitRequestSchema.optional(),
  calls: z.array(PreparedTransactionSchema),
  totalGasUsd: z.string(),
  sourceChainId: z.number().int().positive(),
});

const supportedBaseDepositTokens = new Set(
  [BASE_USDC_ADDRESS, NATIVE_TOKEN_ADDRESS].map((address) =>
    address.toLowerCase(),
  ),
);

export const DepositRequestSchema = z
  .object({
    userAddress: AddressSchema,
    fromToken: AddressSchema,
    fromAmount: decimalStringSchema,
    sourceChainId: z.number().int().positive(),
  })
  .superRefine((value, ctx) => {
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
  });

export type PreparedTransaction = z.infer<typeof PreparedTransactionSchema>;
export type PermitTypedData = z.infer<typeof PermitTypedDataSchema>;
export type PermitRequest = z.infer<typeof PermitRequestSchema>;
export type DepositLeg = z.infer<typeof DepositLegSchema>;
export type DepositPlan = z.infer<typeof DepositPlanSchema>;
export type DepositRequest = z.infer<typeof DepositRequestSchema>;
