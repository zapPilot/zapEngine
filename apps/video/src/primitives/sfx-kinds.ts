/**
 * Sound effects scenes place on their cue frames. They are synthesised, not
 * music: `scripts/lib/sfx.ts` writes one deterministic WAV per kind to
 * `public/sfx/` before Studio, bundling and rendering.
 */
export const SFX_KINDS = [
  'tap',
  'type',
  'whoosh',
  'swish',
  'chime',
  'beep',
  'impact',
  'pop',
  'thud',
  'riser',
] as const;

export type SfxKind = (typeof SFX_KINDS)[number];

/** The file below `public/` that holds `kind`. */
export const sfxFile = (kind: SfxKind): string => `sfx/${kind}.wav`;
