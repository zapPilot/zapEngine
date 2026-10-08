import type React from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useCurrentFrame } from 'remotion';

import { font } from '../brand/fonts';
import { color, hairline } from '../brand/tokens';
import { enter, rise } from './motion';

/**
 * Surface panel matching the product's 20px-radius cards. `glowFrom` turns
 * the border gold, marking the panel the narration is about.
 */
export const Card: React.FC<{
  readonly children: ReactNode;
  readonly from: number;
  readonly glowFrom?: number;
  readonly style?: CSSProperties;
}> = ({ children, from, glowFrom, style }) => {
  const frame = useCurrentFrame();
  const glow = glowFrom === undefined ? 0 : rise(frame, glowFrom, 18);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        padding: '34px 38px',
        borderRadius: 24,
        background: color['sheet'],
        border: glow > 0 ? `1px solid ${color['rule-2']}` : hairline,
        boxShadow:
          glow > 0
            ? `0 0 0 ${6 * glow}px ${color['well']}, 0 30px 80px rgba(0, 0, 0, 0.45)`
            : '0 30px 80px rgba(0, 0, 0, 0.45)',
        ...enter(frame, from, { distance: 22 }),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Small mono caption above a card's main value. */
export const Overline: React.FC<{ readonly children: ReactNode }> = ({
  children,
}) => (
  <span
    style={{
      fontFamily: font.mono,
      fontSize: 22,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color: color['ink-3'],
    }}
  >
    {children}
  </span>
);
