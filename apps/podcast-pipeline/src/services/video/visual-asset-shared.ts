import { z } from 'zod';

export const visualAssetIdentityFields = {
  sha256: z.string().regex(/^[a-f\d]{64}$/),
  perceptualHash: z.string().regex(/^[a-f\d]{16}$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
} as const;

export const VISUAL_ASSET_ID_PATTERN = /^image-\d{2,3}$/;
export const PODCAST_INTRO_ASSET_ID = 'image-98';
export const PODCAST_OUTRO_ASSET_ID = 'image-99';
