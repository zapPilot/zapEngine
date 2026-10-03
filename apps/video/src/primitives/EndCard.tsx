import type React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';

import { font } from '../brand/fonts';
import { color } from '../brand/tokens';
import { enter, rise } from './motion';
import { RevealText } from './RevealText';

/** Closing frame: logo, the line to remember, and where to go. */
export const EndCard: React.FC<{
  readonly claim: string;
  readonly punch: string;
  readonly url: string;
  readonly meta: string;
  readonly from?: number;
  readonly punchFrom: number;
}> = ({ claim, punch, url, meta, from = 0, punchFrom }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: 120,
        textAlign: 'center',
      }}
    >
      <Img
        src={staticFile('brand/zap-pilot-logo.svg')}
        style={{ height: 84, marginBottom: 56, ...enter(frame, from, { distance: 12 }) }}
      />
      <RevealText
        text={claim}
        from={from + 6}
        style={{ fontFamily: font.serif, fontSize: 112, lineHeight: 1.04, color: color.ink }}
      />
      <RevealText
        text={punch}
        from={punchFrom}
        stagger={4}
        style={{
          fontFamily: font.serif,
          fontStyle: 'italic',
          fontSize: 132,
          lineHeight: 1.1,
          color: color.accent,
        }}
      />
      <div
        style={{
          marginTop: 52,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 18,
          ...enter(frame, punchFrom + 14, { distance: 14 }),
        }}
      >
        <span style={{ fontFamily: font.mono, fontSize: 42, color: color.ink }}>{url}</span>
        <span
          style={{
            height: 2,
            width: `${rise(frame, punchFrom + 20, 24) * 100}%`,
            background: color.accent,
          }}
        />
        <span style={{ fontFamily: font.mono, fontSize: 24, color: color.inkDim }}>{meta}</span>
      </div>
    </AbsoluteFill>
  );
};
