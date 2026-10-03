import type React from 'react';
import { useCurrentFrame } from 'remotion';

import { color } from '../brand/tokens';
import { rise } from './motion';

const PATHS = {
  check: 'M7 12.5 L10.5 16 L17 8.5',
  cross: 'M8 8 L16 16 M16 8 L8 16',
} as const;

/** A ringed ✓ or ✗ whose stroke draws in from `from`. */
export const Glyph: React.FC<{
  readonly kind: keyof typeof PATHS;
  readonly from: number;
  readonly size?: number;
  readonly tone?: string;
}> = ({ kind, from, size = 56, tone = color.accent }) => {
  const frame = useCurrentFrame();
  const ring = rise(frame, from, 14);
  const mark = rise(frame, from + 6, 14);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ flex: 'none' }}
    >
      <circle
        cx={12}
        cy={12}
        r={10.5}
        fill="none"
        stroke={tone}
        strokeOpacity={0.45}
        strokeWidth={1.2}
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - ring}
      />
      <path
        d={PATHS[kind]}
        fill="none"
        stroke={tone}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - mark}
      />
    </svg>
  );
};
