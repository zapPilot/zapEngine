import { readFileSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { VOICES } from '../../src/timeline/voices';
import type { BrandClip } from './speech-plan';
import { fileDigest } from './vo-cache';

export const brandProvenance = z.object({
  spokenText: z.string(),
  displayText: z.string(),
  voice: z.enum(
    Object.keys(VOICES) as [keyof typeof VOICES, ...(keyof typeof VOICES)[]],
  ),
  referenceId: z.string(),
  engine: z.string(),
  speed: z.number(),
  take: z.number().int().positive(),
  durationSeconds: z.number().min(0.15).max(2.5),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  humanApproved: z.literal(true),
  generatedAt: z.iso.datetime(),
});
export function verifyBrandAsset(
  clip: BrandClip,
  publicDir: string,
  engine: string,
): void {
  const file = path.join(publicDir, clip.file);
  const digest = fileDigest(file);
  const record = brandProvenance.parse(
    JSON.parse(readFileSync(file.replace(/\.mp3$/, '.json'), 'utf8')),
  );
  const expected = {
    spokenText: clip.spoken,
    displayText: clip.token,
    voice: clip.voice,
    speed: clip.speed,
    referenceId: VOICES[clip.voice].id,
    engine,
    sha256: digest,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (record[key as keyof typeof record] !== value)
      throw new Error(
        `Brand asset ${clip.token}: ${key} mismatch; regenerate with pnpm --filter @zapengine/video brand-audio`,
      );
  }
}
