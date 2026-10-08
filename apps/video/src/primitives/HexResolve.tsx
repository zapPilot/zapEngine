import type React from 'react';
import type { CSSProperties } from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

import { font } from '../brand/fonts';
import { color } from '../brand/tokens';
import { scrambleText, settledLength } from './scramble';

/**
 * A number or hash that rolls as noise and settles left to right into its
 * real value: the visual for "this exact value goes on-chain".
 */
export const HexResolve: React.FC<{
  readonly value: string;
  readonly from: number;
  readonly duration?: number;
  readonly style?: CSSProperties;
}> = ({ value, from, duration = 26, style }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [from, from + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const text = scrambleText(value, progress, Math.floor(frame / 2));
  const settled = settledLength(value, progress);
  return (
    <span
      style={{
        fontFamily: font.mono,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <span>{text.slice(0, settled)}</span>
      <span style={{ color: color['ink-3'] }}>{text.slice(settled)}</span>
    </span>
  );
};
