import type React from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { font } from '../brand/fonts';
import { color } from '../brand/tokens';

/** Pill label for technical facts: compiler, network, verification. */
export const Chip: React.FC<{
  readonly children: ReactNode;
  readonly tone?: 'accent' | 'neutral';
  /** Leading dot colour, e.g. an asset colour. */
  readonly dot?: string;
  readonly style?: CSSProperties;
}> = ({ children, tone = 'neutral', dot, style }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 20px',
      borderRadius: 999,
      border: `1px solid ${tone === 'accent' ? color.accentLine : color.lineHi}`,
      background: tone === 'accent' ? color.accentSubtle : color.surface,
      color: tone === 'accent' ? color.accent : color.ink,
      fontFamily: font.mono,
      fontSize: 24,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    {dot === undefined ? null : (
      <span
        style={{ width: 10, height: 10, borderRadius: 999, background: dot }}
      />
    )}
    {children}
  </span>
);
