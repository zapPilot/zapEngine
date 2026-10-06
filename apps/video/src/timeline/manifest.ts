import { z } from 'zod';

const voClipSchema = z.object({
  /** Path below `public/`, passed to `staticFile()`. */
  file: z.string().min(1),
  /** Hash of the spoken text and voice settings; see scripts/lib/vo-cache.ts. */
  fingerprint: z.string().min(1),
  durationSeconds: z.number().positive(),
});

/**
 * Written by `pnpm voiceover`, read by the composition and the tests. An empty
 * `lines` record is valid: the timeline then estimates every line so a draft
 * storyboard can be previewed before any narration is paid for.
 */
const voManifestSchema = z.object({
  videoId: z.string().min(1),
  engine: z.string(),
  /** Short hash of engine + reference voice, so a voice swap is visible. */
  voiceKey: z.string(),
  lines: z.record(z.string(), voClipSchema),
});

export type VoClip = z.infer<typeof voClipSchema>;
export type VoManifest = z.infer<typeof voManifestSchema>;

export function parseVoManifest(value: unknown): VoManifest {
  return voManifestSchema.parse(value);
}
