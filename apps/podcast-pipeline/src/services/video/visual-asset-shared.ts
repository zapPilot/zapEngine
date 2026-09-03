import { z } from 'zod';

export const visualAssetIdentityFields = {
  sha256: z.string().regex(/^[a-f\d]{64}$/),
  perceptualHash: z.string().regex(/^[a-f\d]{16}$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
} as const;
