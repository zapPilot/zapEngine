import { z } from 'zod';

import { ProtocolIdSchema } from '../protocols/registry.js';

// Supported chains in POC
export const SUPPORTED_CHAIN_IDS = [1, 8453] as const;
export type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number];

// Intent type enum
export const IntentTypeSchema = z.enum([
  'SWAP',
  'SUPPLY',
  'WITHDRAW',
  'ROTATE',
  'REBALANCE',
]);
type _IntentType = z.infer<typeof IntentTypeSchema>;

// Base intent schema (common fields)
const addressRegex = /^0x[a-fA-F0-9]{40}$/;

// Base intent schema (common fields)
export const BaseIntentSchema = z.object({
  id: z.string().uuid().optional(),
  fromAddress: z.string().regex(addressRegex, 'Invalid Ethereum address'),
  chainId: z
    .number()
    .refine(
      (id): id is SupportedChainId =>
        SUPPORTED_CHAIN_IDS.includes(id as SupportedChainId),
      {
        message: 'Only Ethereum (1) and Base (8453) supported in POC',
      },
    ),
  slippageBps: z.number().int().min(1).max(500).default(50), // 0.01% to 5%, default 0.5%
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Swap intent - simple token swap on same chain
export const SwapIntentSchema = BaseIntentSchema.extend({
  type: z.literal('SWAP'),
  fromToken: z.string().regex(addressRegex, 'Invalid fromToken address'),
  toToken: z.string().regex(addressRegex, 'Invalid toToken address'),
  fromAmount: z
    .string()
    .regex(/^\d+$/, 'Amount must be a wei string')
    .refine((val) => BigInt(val) > 0n, 'Amount must be positive'),
});

// Supply intent - deposit to Morpho vault
export const SupplyIntentSchema = BaseIntentSchema.extend({
  type: z.literal('SUPPLY'),
  fromToken: z.string().regex(addressRegex, 'Invalid fromToken address'),
  fromAmount: z
    .string()
    .regex(/^\d+$/, 'Amount must be a wei string')
    .refine((val) => BigInt(val) > 0n, 'Amount must be positive'),
  vaultAddress: z.string().regex(addressRegex, 'Invalid vault address'),
  protocol: z.literal('morpho'),
});

// Withdraw intent - withdraw from Morpho vault.
// Always returns the vault's underlying asset (whatever `vault.asset()` is).
// For a different output token, compose WITHDRAW + SWAP or use ROTATE.
export const WithdrawIntentSchema = BaseIntentSchema.extend({
  type: z.literal('WITHDRAW'),
  vaultAddress: z.string().regex(addressRegex, 'Invalid vault address'),
  shareAmount: z
    .string()
    .regex(/^\d+$/, 'Share amount must be a wei string')
    .refine((val) => BigInt(val) > 0n, 'Amount must be positive'),
  protocol: z.literal('morpho'),
});

// Rotate intent - withdraw from one vault, swap, deposit to another
export const RotateIntentSchema = BaseIntentSchema.extend({
  type: z.literal('ROTATE'),
  fromVault: z.string().regex(addressRegex, 'Invalid fromVault address'),
  toVault: z.string().regex(addressRegex, 'Invalid toVault address'),
  shareAmount: z
    .string()
    .regex(/^\d+$/, 'Share amount must be a wei string')
    .refine((val) => BigInt(val) > 0n, 'Amount must be positive'),
  intermediateToken: z.string().regex(addressRegex).optional(),
  protocol: z.literal('morpho'),
});

export const RebalanceLegSchema = z.object({
  protocol: ProtocolIdSchema,
  action: z.enum(['supply', 'withdraw', 'swap']),
  token: z.string().regex(addressRegex, 'Invalid token address'),
  amountWei: z
    .string()
    .regex(/^\d+$/, 'Amount must be a wei string')
    .refine((val) => BigInt(val) > 0n, 'Amount must be positive'),
  vaultAddress: z
    .string()
    .regex(addressRegex, 'Invalid vault address')
    .optional(),
});

export const RebalanceIntentSchema = BaseIntentSchema.extend({
  type: z.literal('REBALANCE'),
  legs: z.array(RebalanceLegSchema).min(1),
});

// Union type for all intents - uses discriminatedUnion for better error messages
export const IntentSchema = z.discriminatedUnion('type', [
  SwapIntentSchema,
  SupplyIntentSchema,
  WithdrawIntentSchema,
  RotateIntentSchema,
  RebalanceIntentSchema,
]);

// Inferred TypeScript types.
// *Intent types are the *output* of parsing (defaults resolved; e.g. slippageBps: number).
// *IntentInput types are what callers pass in (defaults optional; e.g. slippageBps?: number).
type _BaseIntent = z.infer<typeof BaseIntentSchema>;
export type SwapIntent = z.infer<typeof SwapIntentSchema>;
export type SupplyIntent = z.infer<typeof SupplyIntentSchema>;
export type WithdrawIntent = z.infer<typeof WithdrawIntentSchema>;
export type RotateIntent = z.infer<typeof RotateIntentSchema>;
type _RebalanceLeg = z.infer<typeof RebalanceLegSchema>;
type _RebalanceIntent = z.infer<typeof RebalanceIntentSchema>;
export type Intent = z.infer<typeof IntentSchema>;

export type SwapIntentInput = z.input<typeof SwapIntentSchema>;
export type SupplyIntentInput = z.input<typeof SupplyIntentSchema>;
export type WithdrawIntentInput = z.input<typeof WithdrawIntentSchema>;
export type RotateIntentInput = z.input<typeof RotateIntentSchema>;
type _RebalanceLegInput = z.input<typeof RebalanceLegSchema>;
type _RebalanceIntentInput = z.input<typeof RebalanceIntentSchema>;
type _IntentInput = z.input<typeof IntentSchema>;
