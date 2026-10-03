import type { Box } from './camera';

/** 1080p layout grid: margins clear of TV-safe edges and the caption band. */
export const frame = { width: 1920, height: 1080 } as const;

export const safe = {
  left: 140,
  right: 140,
  top: 108,
  /** Captions own everything below this line. */
  bottom: 180,
} as const;

/** The content area between the kicker and the caption band. */
export const stage: Box = {
  x: safe.left,
  y: safe.top + 72,
  width: frame.width - safe.left - safe.right,
  height: frame.height - safe.top - 72 - safe.bottom,
};
