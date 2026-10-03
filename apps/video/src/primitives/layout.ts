/** Every composition is authored at 1080p. */
export const frame = { width: 1920, height: 1080 } as const;

/** Margins clear of TV-safe edges; captions own the band below y = 900. */
export const safe = {
  left: 140,
  right: 140,
  top: 108,
} as const;
