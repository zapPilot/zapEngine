import { tokens } from '@zapengine/design-tokens/tokens';
import { Easing } from 'remotion';

import { parseCubicBezier } from './easing';

/** Canvas palette. `@zapengine/design-tokens` is the source of truth. */
export const color = {
  bg: tokens.color.bg,
  surface: tokens.color.surface,
  surfaceElevated: tokens.color['surface-elevated'],
  ink: tokens.color.ink,
  inkDim: tokens.color['ink-dim'],
  inkMuted: tokens.color['ink-muted'],
  line: tokens.color.line,
  lineHi: tokens.color['line-hi'],
  accent: tokens.color.accent,
  accentSoft: tokens.color['accent-soft'],
  accentLine: tokens.color['accent-line'],
  accentSubtle: tokens.color['accent-subtle'],
  danger: tokens.color.danger,
} as const;

/**
 * The calculator chart palette (landing.css `--event-*`), deliberately not the
 * marketing pillar tokens: the video shows the same colours a viewer sees on
 * the page. brand.test.ts fails if landing.css changes them.
 */
export const assetColor = {
  BTC: '#f7931a',
  ETH: '#627eea',
  SPY: '#7ad88f',
  Stable: '#a1a1aa',
} as const;

export type Asset = keyof typeof assetColor;

/** The site's signature ease-out, used for every entrance. */
export const easeOut = Easing.bezier(...parseCubicBezier(tokens.easing.primary));

/** Hairline used for rules and card borders. */
export const hairline = `1px solid ${color.line}`;
