import type React from 'react';
import type { CSSProperties } from 'react';
import { useCurrentFrame } from 'remotion';

import { enter } from './motion';

/** Text that arrives word by word: fade, lift and de-blur. */
export const RevealText: React.FC<{
  readonly text: string;
  readonly from: number;
  /** Frames between consecutive words. */
  readonly stagger?: number;
  readonly style?: CSSProperties;
}> = ({ text, from, stagger = 3, style }) => {
  const frame = useCurrentFrame();
  const words = text.split(' ');
  return (
    <span style={style}>
      {words.map((word, index) => (
        <span
          // Words repeat ("the … the"), so the index disambiguates.
          key={`${index}-${word}`}
          style={{
            display: 'inline-block',
            whiteSpace: 'pre',
            ...enter(frame, from + index * stagger, {
              duration: 16,
              distance: 26,
              blur: 8,
            }),
          }}
        >
          {index < words.length - 1 ? `${word} ` : word}
        </span>
      ))}
    </span>
  );
};
