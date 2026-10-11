import type { FC } from 'react';
import { AbsoluteFill, interpolate } from 'remotion';

import { DeviceShot } from '../../../primitives/DeviceShot';
import { HANDSET, Handset, HANDSET_SCREEN } from '../../../primitives/Handset';
import { rise } from '../../../primitives/motion';
import { hold, key, rigStyle } from '../../../primitives/rig';
import { Sfx } from '../../../primitives/Sfx';
import { cueAt } from '../../../timeline/beats';
import { Disclaimers } from '../../kokode-clinic/primitives/Disclaimers';
import { Icon } from '../../kokode-clinic/primitives/icons';
import { NetworkDiagram } from '../../kokode-clinic/primitives/NetworkDiagram';
import { theme } from '../../kokode-clinic/theme';
import type { SceneOf } from '../assets';
import { Headline } from '../ui/Headline';
import { useSceneClock } from './clock';

const SCREEN_CENTRE = {
  fx: HANDSET.screen.width / 2,
  fy: HANDSET.screen.height / 2,
} as const;

/**
 * The boundary: the staff network seen in perspective as the camera circles
 * it; a phone outside the building tries, and does not connect.
 */
export const Boundary: FC<{ readonly scene: SceneOf<'boundary'> }> = ({
  scene,
}) => {
  const { frame, durationInFrames, story, props, fontFamily } =
    useSceneClock(scene);
  const insideAt = cueAt(scene, props.insideCue);
  const outsideAt = cueAt(scene, props.outsideCue);
  const { boundary } = story.FIGURES;
  const orbit = interpolate(frame, [0, durationInFrames], [-20, -4]);
  const pulse = rise(frame, outsideAt + 10, 16);
  const phoneKeys = [
    ...hold(0, outsideAt - 8, {
      ...SCREEN_CENTRE,
      x: 2400,
      y: 660,
      rx: 10,
      ry: -40,
      rz: 14,
      scale: 0.6,
    }),
    key(outsideAt + 6, {
      ...SCREEN_CENTRE,
      x: 1600,
      y: 640,
      rx: 6,
      ry: -22,
      rz: 5,
      scale: 0.6,
    }),
    key(durationInFrames, {
      ...SCREEN_CENTRE,
      x: 1590,
      y: 630,
      rx: 6,
      ry: -12,
      rz: 3,
      scale: 0.6,
    }),
  ];
  return (
    <AbsoluteFill style={{ fontFamily }}>
      <Headline
        lines={story.BEATS.boundary.title}
        at={2}
        width={900}
        max={84}
        style={{ left: 150, top: 92 }}
      />
      <AbsoluteFill style={{ perspective: 2200 }}>
        <div
          style={{
            position: 'absolute',
            left: 230,
            top: 420,
            transform: `rotateX(30deg) rotateY(${orbit}deg) scale(1.18)`,
            transformOrigin: '50% 50%',
          }}
        >
          <NetworkDiagram from={insideAt - 12} />
        </div>
      </AbsoluteFill>
      <DeviceShot keys={phoneKeys}>
        {(pose) => (
          <Handset light={pose.ry} style={rigStyle(pose, HANDSET_SCREEN)}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 28,
                background: theme.bg,
                fontFamily,
              }}
            >
              <span
                style={{ fontSize: 30, fontWeight: 700, color: theme.muted }}
              >
                {boundary.outside}
              </span>
              <div
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 170,
                  height: 170,
                  borderRadius: 85,
                  background: `rgba(215, 0, 21, ${0.08 + pulse * 0.06})`,
                  boxShadow: `0 0 0 ${pulse * 26}px rgba(215, 0, 21, ${0.12 * (1 - pulse)})`,
                }}
              >
                <Icon
                  name="blocked"
                  size={96}
                  color={theme.danger}
                  strokeWidth={2}
                />
              </div>
              <span
                style={{ fontSize: 40, fontWeight: 800, color: theme.danger }}
              >
                {boundary.blocked}
              </span>
            </div>
          </Handset>
        )}
      </DeviceShot>
      <Disclaimers notes={story.PROMO.boundary.notes} />
      <Sfx kind="swish" at={insideAt - 12} />
      <Sfx kind="beep" at={insideAt + 16} />
      <Sfx kind="whoosh" at={outsideAt - 8} />
      <Sfx kind="thud" at={outsideAt + 10} />
    </AbsoluteFill>
  );
};
