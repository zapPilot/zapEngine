import type { CSSProperties, FC } from 'react';
import { useCurrentFrame } from 'remotion';

import { enter } from '../../../primitives/motion';
import { RevealText } from '../../../primitives/RevealText';
import { jaFont } from '../fonts';
import { theme } from '../theme';

/** Frames between characters as a headline types itself in. */
const STAGGER = 1;

/**
 * A Japanese headline from the story, one line per entry, arriving character
 * by character. `eyebrow` is the beat's label above it.
 */
export const JaHeadline: FC<{
  readonly lines: readonly string[];
  readonly from: number;
  readonly eyebrow?: string;
  readonly size?: number;
  readonly color?: string;
  readonly style?: CSSProperties;
}> = ({ lines, from, eyebrow, size = 76, color = theme.ink, style }) => {
  const frame = useCurrentFrame();
  // Each line starts where the previous one finished typing.
  let next = from;
  const starts = lines.map((line) => {
    const start = next;
    next += Array.from(line).length * STAGGER;
    return start;
  });
  return (
    <div
      style={{
        fontFamily: jaFont,
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1.3,
        letterSpacing: '-0.02em',
        color,
        ...style,
      }}
    >
      {eyebrow === undefined ? null : (
        <div
          style={{
            marginBottom: size * 0.32,
            fontSize: Math.round(size * 0.36),
            fontWeight: 700,
            letterSpacing: '0.04em',
            color: theme.blue,
            ...enter(frame, from - 6, { distance: 12 }),
          }}
        >
          {eyebrow}
        </div>
      )}
      {lines.map((line, index) => (
        <div key={line} style={{ whiteSpace: 'nowrap' }}>
          <RevealText
            text={line}
            pieces={Array.from(line)}
            from={starts[index] ?? from}
            stagger={STAGGER}
          />
        </div>
      ))}
    </div>
  );
};
