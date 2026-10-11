import type React from 'react';
import type { CSSProperties } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { font } from '../brand/fonts';
import { color, hairline } from '../brand/tokens';
import type { CaptionCue } from '../timeline/timeline';
import { rise } from './motion';

/**
 * Burned-in captions. Always on: judges and social feeds mostly watch muted.
 * `style` overrides the caption box, e.g. a font for another script, and
 * `placement` where the box sits in the frame.
 */
export const Captions: React.FC<{
  readonly cues: readonly CaptionCue[];
  readonly style?: CSSProperties;
  readonly placement?: CSSProperties;
}> = ({ cues, style, placement }) => {
  const frame = useCurrentFrame();
  const cue = cues.find(
    (candidate) => frame >= candidate.from && frame < candidate.to,
  );
  if (cue === undefined) return null;
  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 60,
        pointerEvents: 'none',
        ...placement,
      }}
    >
      <div
        style={{
          maxWidth: 1560,
          padding: '14px 30px',
          borderRadius: 16,
          background: 'rgba(10, 10, 10, 0.8)',
          border: hairline,
          color: color.ink,
          fontFamily: font.text,
          fontWeight: 500,
          fontSize: 42,
          lineHeight: 1.25,
          textAlign: 'center',
          opacity: rise(frame, cue.from, 4),
          ...style,
        }}
      >
        {cue.text}
      </div>
    </AbsoluteFill>
  );
};
