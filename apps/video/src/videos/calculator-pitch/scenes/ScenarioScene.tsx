import type React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { color } from '../../../brand/tokens';
import { Chip } from '../../../primitives/Chip';
import { Kicker } from '../../../primitives/Kicker';
import { safe } from '../../../primitives/layout';
import { enter, rise } from '../../../primitives/motion';
import { type CameraKey, UiShot } from '../../../primitives/UiShot';
import { cueFrame } from '../../../timeline/beats';
import { type SceneOf, shot } from '../assets';

const VERDICT_WINDOW = { x: 520, y: 210, width: 880, height: 600 };

export const ScenarioScene: React.FC<{
  readonly scene: SceneOf<'scenario'>;
}> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { kicker, change, holdCue } = scene.spec.props;
  const clickAt = 24;
  const holdAt = cueFrame(scene, 'scenario', holdCue);
  const keys: CameraKey[] = [
    { at: 0, target: 'scenarios', fill: 0.9, anchor: { x: 0.5, y: 0.32 } },
  ];
  return (
    <AbsoluteFill>
      <UiShot
        shot={shot('inputs')}
        keys={keys}
        click={{ target: 'above', from: 4, at: clickAt }}
      />
      <UiShot
        shot={shot('above')}
        keys={keys}
        highlights={[{ target: 'above', from: clickAt + 4 }]}
        style={{ opacity: rise(frame, clickAt, 6) }}
      />
      <AbsoluteFill
        style={{
          background: color['ground'],
          opacity: 0.72 * rise(frame, holdAt - 10, 12),
        }}
      />
      {frame >= holdAt - 10 ? (
        <UiShot
          shot={shot('hold')}
          mode="window"
          region={VERDICT_WINDOW}
          keys={[
            {
              at: 0,
              target: 'verdict',
              fill: 0.86,
              anchor: { x: 0.5, y: 0.42 },
            },
          ]}
          highlights={[{ target: 'verdict', from: holdAt + 6 }]}
          style={enter(frame, holdAt - 10, { distance: 30 })}
        />
      ) : null}
      <Kicker>{kicker}</Kicker>
      <div
        style={{
          position: 'absolute',
          right: safe.right,
          top: safe.top - 8,
          ...enter(frame, clickAt + 6, { distance: 12 }),
        }}
      >
        <Chip tone="accent">{change}</Chip>
      </div>
    </AbsoluteFill>
  );
};
