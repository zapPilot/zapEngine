import { z } from 'zod';

import { WALLET_ADDRESS_REGEX } from '../shared/wallet.js';

const HexDataSchema = z
  .string()
  .regex(/^0x(?:[0-9a-fA-F]{2})*$/, 'data must be an even-length hex string')
  .max(100_002);

const HexQuantitySchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]+$/, 'value must be a hex quantity');

export const PrivyAtomicBatchCallSchema = z.object({
  to: z.string().regex(WALLET_ADDRESS_REGEX, 'Invalid call target address'),
  data: HexDataSchema.optional(),
  value: HexQuantitySchema.optional(),
});

export const PrivyAtomicBatchRequestSchema = z.object({
  walletId: z.string().min(1),
  walletAddress: z
    .string()
    .regex(WALLET_ADDRESS_REGEX, 'Invalid Privy wallet address'),
  chainId: z.union([z.literal(8453), z.literal(42161)]),
  calls: z.array(PrivyAtomicBatchCallSchema).min(1),
  idempotencyKey: z.string().min(1).max(128),
});

export const PrivyAtomicBatchResponseSchema = z.object({
  transactionId: z.string().min(1),
  caip2: z.string().regex(/^eip155:\d+$/),
});

export type PrivyAtomicBatchCall = z.infer<typeof PrivyAtomicBatchCallSchema>;
export type PrivyAtomicBatchRequest = z.infer<
  typeof PrivyAtomicBatchRequestSchema
>;
export type PrivyAtomicBatchResponse = z.infer<
  typeof PrivyAtomicBatchResponseSchema
>;
