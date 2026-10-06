import type { FC } from 'react';
import { useCurrentFrame } from 'remotion';

import { glide } from '../../../primitives/motion';
import { theme } from '../theme';

// Placeholder line drawing (the same strokes as the site's demo figure). It
// is replaced by a figure the local model generated and a physician checked.
const STROKES = [
  'M30 42C52 16 148 16 170 42',
  'M30 42C21 72 30 112 62 136M170 42C179 72 170 112 138 136',
  'M40 50C60 41 85 43 98 56M160 50C140 41 115 43 102 56',
  'M100 52C70 52 46 72 49 101C51 126 76 141 100 133C124 141 149 126 151 101C154 72 130 52 100 52Z',
  'M100 30V146',
  'M81 98C79 114 77 130 75 150',
] as const;

/** Frames each stroke takes to draw. */
const STROKE_FRAMES = 14;

/** The anatomy sketch drawing itself stroke by stroke from `from`. */
export const SketchCanvas: FC<{
  readonly from: number;
  readonly width: number;
}> = ({ from, width }) => {
  const frame = useCurrentFrame();
  const last = STROKES.length - 1;
  return (
    <svg width={width} height={width * 0.8} viewBox="0 0 200 160">
      {STROKES.map((d, index) => {
        const drawn = glide(frame, from + index * 8, STROKE_FRAMES);
        return (
          <path
            key={d}
            d={d}
            pathLength={1}
            fill="none"
            stroke={index === last ? theme.blue : '#3a3a3c'}
            strokeWidth={index === 4 ? 0.8 : 1.6}
            strokeDasharray={index === 4 ? '0.02 0.03' : '1'}
            strokeDashoffset={index === 4 ? 0 : 1 - drawn}
            opacity={index === 4 ? drawn * 0.5 : 1}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
};
