import { isWalletAddress } from '@zapengine/types';
import { z } from 'zod';

export const dataSourceEnum = z.enum([
  'defillama',
  'debank',
  'hyperliquid',
  'feargreed',
  'token-price',
  'stock-price',
]);

export const webhookPayloadSchema = z
  .object({
    trigger: z.enum(['scheduled', 'manual']),
    source: dataSourceEnum.optional(),
    sources: z.array(dataSourceEnum).optional(),
    filters: z
      .object({
        chains: z.array(z.string()).optional(),
        protocols: z.array(z.string()).optional(),
        minTvl: z.number().positive().optional(),
      })
      .optional(),
  })
  .refine(
    (data) => !(data.source !== undefined && data.sources !== undefined),
    {
      message:
        "Cannot specify both 'source' and 'sources'. Use only one format.",
      path: ['sources'],
    },
  )
  .transform((data) => ({
    trigger: data.trigger,
    sources: data.source ? [data.source] : data.sources,
    filters: data.filters,
  }));

export const walletFetchSchema = z.object({
  userId: z.string().uuid(),
  walletAddress: z.string().refine(isWalletAddress, {
    message: 'Invalid Ethereum wallet address',
  }),
  trigger: z.enum(['manual', 'webhook']),
  secret: z.string().optional(),
});
