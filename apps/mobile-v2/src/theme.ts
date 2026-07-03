import { tokens } from '@zapengine/design-tokens/tokens';

export const colors = {
  background: tokens.color.bg,
  surface: tokens.color.surface,
  surfaceElevated: tokens.color['surface-elevated'],
  ink: tokens.color.ink,
  inkDim: tokens.color['ink-dim'],
  line: tokens.color.line,
  accent: tokens.color.accent,
  accentMuted: tokens.color['accent-muted'],
} as const;

// No spacing scale in design tokens yet — stays local until one exists.
export const spacing = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
} as const;
