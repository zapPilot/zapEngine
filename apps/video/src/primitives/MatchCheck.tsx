import type React from 'react';
import type { CSSProperties } from 'react';
import { useCurrentFrame } from 'remotion';

import { font } from '../brand/fonts';
import { color, hairline } from '../brand/tokens';
import { Glyph } from './Glyph';
import { HexResolve } from './HexResolve';
import { enter, rise } from './motion';

/** ✓ + statement: the moment two independent sources agree. */
export const MatchBanner: React.FC<{
  readonly text: string;
  readonly from: number;
  readonly detail?: string;
  readonly style?: CSSProperties;
}> = ({ text, from, detail, style }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 22,
        ...enter(frame, from, { distance: 16 }),
        ...style,
      }}
    >
      <Glyph kind="check" from={from} size={60} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span
          style={{
            fontFamily: font.sans,
            fontWeight: 500,
            fontSize: 40,
            color: color.accent,
          }}
        >
          {text}
        </span>
        {detail === undefined ? null : (
          <span style={{ fontFamily: font.mono, fontSize: 24, color: color.inkDim }}>
            {detail}
          </span>
        )}
      </div>
    </div>
  );
};

type Row = { readonly label: string; readonly value: string };

/**
 * Two values from independent sources, the second resolving onto the first,
 * then a ✓ once they are equal. Used for the codehash check.
 */
export const MatchCheck: React.FC<{
  readonly expected: Row;
  readonly observed: Row;
  readonly from: number;
  readonly matchAt: number;
  readonly verdict: string;
  readonly detail?: string;
}> = ({ expected, observed, from, matchAt, verdict, detail }) => {
  const frame = useCurrentFrame();
  const matched = rise(frame, matchAt, 18);
  const valueStyle: CSSProperties = {
    fontSize: 34,
    letterSpacing: '0.01em',
    color: matched > 0 ? color.accent : color.ink,
  };
  const row = (label: string, start: number, value: React.ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, ...enter(frame, start) }}>
      <span
        style={{
          fontFamily: font.sans,
          fontSize: 26,
          color: color.inkDim,
          letterSpacing: '0.02em',
        }}
      >
        {label}
      </span>
      {value}
    </div>
  );
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 40,
        padding: '52px 60px',
        borderRadius: 28,
        border: hairline,
        background: color.surface,
        ...enter(frame, from, { distance: 20 }),
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 52,
          width: 3,
          height: `${matched * 170}px`,
          background: color.accent,
        }}
      />
      {row(
        expected.label,
        from + 4,
        <span style={{ fontFamily: font.mono, ...valueStyle }}>{expected.value}</span>,
      )}
      {row(
        observed.label,
        from + 14,
        <HexResolve
          value={observed.value}
          from={from + 18}
          duration={Math.max(8, matchAt - from - 22)}
          style={valueStyle}
        />,
      )}
      <div style={{ height: 1, background: color.line }} />
      <MatchBanner text={verdict} detail={detail} from={matchAt} />
    </div>
  );
};
