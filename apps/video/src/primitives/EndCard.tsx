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
        src={staticFile('brand/zap-pilot-logo-night.svg')}
        style={{
          height: 84,
          marginBottom: 56,
          ...enter(frame, from, { distance: 12 }),
        }}
      />
      <RevealText
        text={claim}
        from={from + 6}
        style={{
          fontFamily: font.display,
          fontSize: 112,
          lineHeight: 1.04,
          color: color.ink,
        }}
      />
      <RevealText
        text={punch}
        from={punchFrom}
        stagger={4}
        style={{
          fontFamily: font.display,
          fontStyle: 'italic',
          fontSize: 132,
          lineHeight: 1.1,
          color: color['ink'],
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
        <span style={{ fontFamily: font.mono, fontSize: 42, color: color.ink }}>
          {url}
        </span>
        <span
          style={{
            height: 2,
            width: `${rise(frame, punchFrom + 20, 24) * 100}%`,
            background: color['ink'],
          }}
        />
        <span
          style={{ fontFamily: font.mono, fontSize: 24, color: color['ink-2'] }}
        >
          {meta}
        </span>
      </div>
    </AbsoluteFill>
  );
};
