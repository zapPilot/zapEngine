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
});

export const PrivyPrepareSendCallsRequestSchema =
  PrivyAtomicBatchPayloadSchema.extend({});

export const PrivyPrepareSendCallsResponseSchema = z.object({
  previewId: z.string().min(1),
  batchHash: z.string().min(1),
  decodedCalls: z.array(z.any()),
  tenderlyResult: z.any(),
  assetChanges: z.array(z.any()),
  gasEstimate: z.string().min(1),
  typedDataPayload: z.any(),
  expiresAt: z.number().int().positive(),
  authorizationPayload: z.string().min(1),
  requestExpiry: z.number().int().positive(),
});

export const PrivyConfirmSendCallsRequestSchema = z.object({
  previewId: z.string().min(1),
  userSignature: z.string().min(1),
  authorizationSignature: z.string().min(1),
});

export const PrivyConfirmSendCallsResponseSchema =
  PrivyAtomicBatchResponseSchema.extend({});

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
export type PrivyConfirmSendCallsRequest = z.infer<
  typeof PrivyConfirmSendCallsRequestSchema
>;
export type PrivyConfirmSendCallsResponse = z.infer<
  typeof PrivyConfirmSendCallsResponseSchema
>;
