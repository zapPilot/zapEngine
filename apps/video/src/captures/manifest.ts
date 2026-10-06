import { z } from 'zod';

const boxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});

const capturedShotSchema = z.object({
  /** Image below `public/`, passed to `staticFile()`. */
  file: z.string().min(1),
  /** Image size in CSS pixels; the file holds `deviceScaleFactor` times more. */
  width: z.number().positive(),
  height: z.number().positive(),
  deviceScaleFactor: z.number().positive(),
  /** Target boxes in CSS pixels, relative to the image's top-left corner. */
  targets: z.record(z.string(), boxSchema),
  /** Values recorded by checks, e.g. the block the bytecode check ran at. */
  values: z.record(z.string(), z.string()),
  /** Human-readable list of the checks that passed. */
  checks: z.array(z.string()),
});

/** Written by `pnpm capture <video>`; read by scenes through `useShot`. */
const captureManifestSchema = z.object({
  videoId: z.string().min(1),
  url: z.url(),
  capturedAt: z.string(),
  shots: z.record(z.string(), capturedShotSchema),
});

export type CapturedShot = z.infer<typeof capturedShotSchema>;
export type CaptureManifest = z.infer<typeof captureManifestSchema>;

export function parseCaptureManifest(value: unknown): CaptureManifest {
  return captureManifestSchema.parse(value);
}
