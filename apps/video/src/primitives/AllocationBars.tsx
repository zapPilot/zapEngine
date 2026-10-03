import type React from 'react';
import { useCurrentFrame } from 'remotion';

import { font } from '../brand/fonts';
import { type Asset, assetColor, color } from '../brand/tokens';
import { enter, glide } from './motion';

type Shares = Readonly<Record<Asset, number>>;

const ASSETS = Object.keys(assetColor) as Asset[];
const BAR_HEIGHT = 26;

const percent = (value: number) => `${value.toFixed(2)}%`;

const Bar: React.FC<{ readonly shares: Shares; readonly width: number }> = ({
  shares,
  width,
}) => {
  let offset = 0;
  return (
    <div style={{ position: 'relative', width, height: BAR_HEIGHT }}>
      {ASSETS.map((asset) => {
        const segment = (shares[asset] / 100) * width;
        const left = offset;
        offset += segment;
        // Inset both ends so segments read as separate pills; a share that
        // shrinks to nothing disappears instead of leaving a double gap.
        return (
          <div
            key={asset}
            style={{
              position: 'absolute',
              left: left + 3,
              top: 0,
              width: Math.max(0, segment - 6),
              height: BAR_HEIGHT,
              borderRadius: 999,
              background: assetColor[asset],
            }}
          />
        );
      })}
    </div>
  );
};

/**
 * Before/after allocation in the calculator's own palette. The "after" bar
 * starts as a copy of "before" and flows into the contract's answer.
 */
export const AllocationBars: React.FC<{
  readonly before: Shares;
  readonly after: Shares;
  readonly from: number;
  readonly morphAt: number;
  readonly width?: number;
}> = ({ before, after, from, morphAt, width = 760 }) => {
  const frame = useCurrentFrame();
  const t = glide(frame, morphAt, 30);
  const current = Object.fromEntries(
    ASSETS.map((asset) => [asset, before[asset] + (after[asset] - before[asset]) * t]),
  ) as Shares;
  const label = (text: string) => (
    <span style={{ width: 120, fontFamily: font.sans, fontSize: 26, color: color.inkDim }}>
      {text}
    </span>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26, ...enter(frame, from) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        {label('Before')}
        <Bar shares={before} width={width} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        {label('After')}
        <Bar shares={current} width={width} />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto auto auto',
          columnGap: 36,
          rowGap: 14,
          marginTop: 10,
          paddingTop: 22,
          borderTop: `1px solid ${color.line}`,
          fontSize: 30,
        }}
      >
        {ASSETS.map((asset) => {
          const changed = before[asset] !== after[asset];
          return [
            <span
              key={`${asset}-name`}
              style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: font.sans, color: color.ink }}
            >
              <span style={{ width: 14, height: 14, borderRadius: 4, background: assetColor[asset] }} />
              {asset}
            </span>,
            <span key={`${asset}-before`} style={{ fontFamily: font.mono, color: color.inkDim, textAlign: 'right' }}>
              {percent(before[asset])}
            </span>,
            <span key={`${asset}-arrow`} style={{ fontFamily: font.mono, color: color.inkMuted }}>
              →
            </span>,
            <span
              key={`${asset}-after`}
              style={{
                fontFamily: font.mono,
                textAlign: 'right',
                color: changed && t > 0.5 ? color.accent : color.ink,
                fontWeight: changed ? 500 : 400,
              }}
            >
              {percent(t > 0.5 ? after[asset] : before[asset])}
            </span>,
          ];
        })}
      </div>
    </div>
  );
};
