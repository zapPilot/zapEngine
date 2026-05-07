import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { packageRoot } from './paths.js';

export interface DesignTokens {
  color: {
    bg: string;
    'bg-2': string;
    surface: string;
    'surface-elevated': string;
    ink: string;
    'ink-dim': string;
    'ink-faint': string;
    line: string;
    'line-hi': string;
    accent: string;
    'accent-soft': string;
    'accent-muted': string;
    error: string;
    success: string;
    pillar: {
      spy: string;
      btc: string;
      usd: string;
    };
  };
  font: {
    serif: string;
    mono: string;
    sans: string;
  };
  radius: {
    pill: number;
    subtle: number;
    control: number;
    card: number;
  };
  easing: {
    primary: string;
  };
}

export function loadTokens(): DesignTokens {
  return JSON.parse(
    readFileSync(join(packageRoot, 'tokens.json'), 'utf8'),
  ) as DesignTokens;
}
