import type React from 'react';
import { useCurrentFrame } from 'remotion';

import { font } from '../brand/fonts';
import { color } from '../brand/tokens';
import { safe } from './layout';
import { rise } from './motion';

/** Mono overline that names the scene, with a gold rule drawing in. */
export const Kicker: React.FC<{
  readonly children: string;
  readonly from?: number;
}> = ({ children, from = 0 }) => {
  const frame = useCurrentFrame();
  const t = rise(frame, from, 20);
  return (
    <div
      style={{
        position: 'absolute',
        left: safe.left,
        top: safe.top,
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        fontFamily: font.mono,
        fontSize: 24,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: color['ink-2'],
        opacity: t,
      }}
    >
      <span style={{ width: 56 * t, height: 2, background: color['ink'] }} />
      {children}
    </div>
  );
};
