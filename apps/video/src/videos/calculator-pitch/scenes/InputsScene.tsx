import type React from 'react';
import type { ReactNode } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { font } from '../../../brand/fonts';
import { color } from '../../../brand/tokens';
import { Card, Overline } from '../../../primitives/Card';
import { HexResolve } from '../../../primitives/HexResolve';
import { Kicker } from '../../../primitives/Kicker';
import { enter, rise } from '../../../primitives/motion';
import { type CameraKey, UiShot } from '../../../primitives/UiShot';
import { cueFrame } from '../../../timeline/beats';
import { type SceneOf, shot } from '../assets';
import { facts } from '../facts';

const Step: React.FC<{
  readonly label: string;
  readonly from: number;
  readonly children: ReactNode;
}> = ({ label, from, children }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        ...enter(frame, from, { distance: 14 }),
      }}
    >
      <span
        style={{ fontFamily: font.sans, fontSize: 22, color: color.inkMuted }}
      >
        {label}
      </span>
      {children}
    </div>
  );
};

export const InputsScene: React.FC<{ readonly scene: SceneOf<'inputs'> }> = ({
  scene,
}) => {
  const frame = useCurrentFrame();
  const { kicker, encodeCue, encoding } = scene.spec.props;
  const encodeAt = cueFrame(scene, 'inputs', encodeCue);
  const keys: CameraKey[] = [
    { at: 0, target: 'scenarios', fill: 0.9, anchor: { x: 0.5, y: 0.3 } },
    { at: 64, target: 'btcRow', fill: 0.62, anchor: { x: 0.36, y: 0.52 } },
  ];
  const { btc } = facts.example;
  return (
    <AbsoluteFill>
      <UiShot
        shot={shot('inputs')}
        keys={keys}
        highlights={[{ target: 'real', from: 14, to: 52 }]}
      />
      <UiShot
        shot={shot('cell')}
        keys={keys}
        highlights={[{ target: 'btcPrice', from: encodeAt }]}
        style={{ opacity: rise(frame, encodeAt - 6, 8) }}
      />
      <Kicker>{kicker}</Kicker>
      <div style={{ position: 'absolute', right: 140, top: 250, width: 720 }}>
        <Card from={encodeAt + 4} glowFrom={encodeAt + 40} style={{ gap: 24 }}>
          <Overline>{encoding.heading}</Overline>
          <Step label={encoding.cell} from={encodeAt + 8}>
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 36,
                color: color.inkDim,
              }}
            >
              {btc.display}
            </span>
          </Step>
          <Step label={encoding.digits} from={encodeAt + 16}>
            <span
              style={{ fontFamily: font.mono, fontSize: 40, color: color.ink }}
            >
              {btc.price}
            </span>
          </Step>
          <Step label={encoding.wad} from={encodeAt + 24}>
            <HexResolve
              value={btc.priceWad}
              from={encodeAt + 26}
              duration={28}
              style={{ fontSize: 40, color: color.accent }}
            />
          </Step>
        </Card>
      </div>
    </AbsoluteFill>
  );
};
