import type React from 'react';
import { useCurrentFrame } from 'remotion';

import { color } from '../brand/tokens';
import { rise } from './motion';

/** A horizontal hairline arrow that draws from left to right. */
export const Arrow: React.FC<{
  readonly from: number;
  readonly width?: number;
  readonly tone?: string;
}> = ({ from, width = 120, tone = color['rule-2'] }) => {
  const frame = useCurrentFrame();
  const t = rise(frame, from, 16);
  return (
    <svg
      width={width}
      height={24}
      style={{ flex: 'none', overflow: 'visible' }}
    >
      <line
        x1={0}
        y1={12}
        x2={(width - 4) * t}
        y2={12}
        stroke={tone}
        strokeWidth={2}
      />
      <path
        d={`M ${width - 14} 4 L ${width - 2} 12 L ${width - 14} 20`}
        fill="none"
        stroke={tone}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={t > 0.85 ? 1 : 0}
      />
    </svg>
  );
};
