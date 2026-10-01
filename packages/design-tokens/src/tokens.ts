import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { packageRoot } from './paths.js';

export interface DesignTokens {
  color: {
    bg: string;
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
    warning: string;
    success: string;
    pillar: {
      spy: string;
      btc: string;
      usd: string;
      eth: string;
      alt: string;
    };
    danger: string;
    'surface-high': string;
    'surface-overlay': string;
    scrim: string;
    'ink-muted': string;
    'ink-inverse': string;
    'accent-hover': string;
    'accent-dim': string;
    'accent-subtle': string;
    'accent-line': string;
    'danger-soft': string;
    'danger-line': string;
    'warning-soft': string;
    'warning-line': string;
    'success-soft': string;
    'success-line': string;
  };
  font: {
    serif: string;
    sans: string;
    'sans-medium': string;
    'sans-semibold': string;
    'sans-bold': string;
    mono: string;
    'mono-medium': string;
    'mono-semibold': string;
    'mono-bold': string;
  };
  radius: {
    subtle: number;
    tile: number;
    control: number;
    card: number;
    sheet: number;
    pill: number;
  };
  easing: {
    primary: string;
    standard: string;
    exit: string;
  };
  type: {
    display: {
      size: number;
      line: number;
      tracking: number;
    };
    'display-sm': {
      size: number;
      line: number;
      tracking: number;
    };
    title: {
      size: number;
      line: number;
      tracking: number;
    };
    'title-sm': {
      size: number;
      line: number;
      tracking: number;
    };
    heading: {
      size: number;
      line: number;
      tracking: number;
    };
    subheading: {
      size: number;
      line: number;
      tracking: number;
    };
    body: {
      size: number;
      line: number;
      tracking: number;
    };
    'body-sm': {
      size: number;
      line: number;
      tracking: number;
    };
    label: {
      size: number;
      line: number;
      tracking: number;
    };
    caption: {
      size: number;
      line: number;
      tracking: number;
    };
    overline: {
      size: number;
      line: number;
      tracking: number;
    };
    'numeric-lg': {
      size: number;
      line: number;
      tracking: number;
    };
    numeric: {
      size: number;
      line: number;
      tracking: number;
    };
    'numeric-sm': {
      size: number;
      line: number;
      tracking: number;
    };
  };
  shadow: {
    raised: {
      css: string;
      elevation: number;
    };
    overlay: {
      css: string;
      elevation: number;
    };
  };
  duration: {
    fast: number;
    normal: number;
    slow: number;
    slower: number;
  };
  motion: {
    'press-scale': number;
    'press-spring': {
      speed: number;
      bounciness: number;
    };
    'enter-spring': {
      damping: number;
      stiffness: number;
      mass: number;
    };
  };
  breakpoint: {
    medium: number;
    expanded: number;
  };
  container: {
    narrow: number;
    measure: number;
    reading: number;
    dashboard: number;
  };
  gutter: {
    compact: number;
    medium: number;
    expanded: number;
  };
  size: {
    hit: number;
    control: {
      sm: number;
      md: number;
      lg: number;
    };
    icon: {
      xs: number;
      sm: number;
      md: number;
      lg: number;
      xl: number;
    };
    sidenav: number;
  };
}

export function loadTokens(): DesignTokens {
  return JSON.parse(
    readFileSync(join(packageRoot, 'tokens.json'), 'utf8'),
  ) as DesignTokens;
}
