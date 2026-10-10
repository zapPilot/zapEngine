import type { FC } from 'react';
import { AbsoluteFill, Easing, interpolate } from 'remotion';

import { DeviceShot } from '../../../primitives/DeviceShot';
import { Flash, Shake } from '../../../primitives/fx';
import { Lift, Slam } from '../../../primitives/Kinetic';
import { key, rigStyle } from '../../../primitives/rig';
import { Sfx } from '../../../primitives/Sfx';
import { fitFontSize } from '../../../primitives/text';
import { cueAt } from '../../../timeline/beats';
import { BrandMark } from '../../kokode-clinic/primitives/BrandMark';
import { Disclaimers } from '../../kokode-clinic/primitives/Disclaimers';
import { Icon } from '../../kokode-clinic/primitives/icons';
import { theme } from '../../kokode-clinic/theme';
import type { SceneOf } from '../assets';
import { Headline } from '../ui/Headline';
import { BOX_CENTRE, BOX_LIGHT, KokodeBox } from '../ui/KokodeBox';
import { headline } from '../ui/look';
import { useSceneClock } from './clock';

const overshoot = Easing.bezier(0.2, 1.35, 0.35, 1);
const dive = Easing.bezier(0.7, 0, 0.84, 0);

/**
 * The drop: the blue point bursts, the KOKODE device rises and swings to its
 * hero angle, "AI, here." lands, and the camera dives into its status light.
 */
export const Reveal: FC<{ readonly scene: SceneOf<'reveal'> }> = ({
  scene,
}) => {
  const { story, props, fontFamily, lang, frame, durationInFrames, beat } =
    useSceneClock(scene);
  const diveFrom = durationInFrames - 26;
  const keys = [
    key(0, {
      ...BOX_CENTRE,
      x: 1260,
      y: 1500,
      rx: 72,
      ry: -52,
      rz: 12,
      scale: 0.7,
    }),
    key(beat(2), {
      ...BOX_CENTRE,
      x: 1270,
      y: 580,
      rx: 58,
      ry: -26,
      rz: 6,
      scale: 1,
      ease: overshoot,
    }),
    key(diveFrom, {
      ...BOX_CENTRE,
      x: 1250,
      y: 570,
      rx: 55,
      ry: -10,
      rz: 3,
      scale: 1.04,
    }),
    key(durationInFrames, {
      ...BOX_LIGHT,
      x: 960,
      y: 540,
      rx: 38,
      ry: 0,
      rz: 0,
      scale: 9,
      ease: dive,
    }),
  ];
  const burst = interpolate(frame, [0, 10], [0.05, 40], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const flood = interpolate(
    frame,
    [durationInFrames - 9, durationInFrames - 1],
    [0, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    },
  );
  const eyebrow = story.BEATS.hero.eyebrow;
  const textGone = durationInFrames - 30;
  return (
    <AbsoluteFill>
      <Shake at={0} strength={16}>
        <DeviceShot keys={keys}>
          {(pose) => (
            <KokodeBox
              light={pose.ry}
              glow={interpolate(frame, [beat(2), beat(3)], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              })}
              style={rigStyle(pose)}
            />
          )}
        </DeviceShot>
        <div style={{ position: 'absolute', left: 150, top: 250, width: 820 }}>
          <Lift at={beat(1)} exit={textGone}>
            <BrandMark size={58} />
          </Lift>
          <Slam
            text={eyebrow}
            at={beat(2)}
            exit={textGone}
            look={headline(
              fontFamily,
              lang,
              fitFontSize([eyebrow], 820, 168),
              theme.blue,
            )}
            style={{ marginTop: 34, transformOrigin: '0 50%' }}
          />
        </div>
        <Headline
          lines={story.BEATS.hero.title}
          at={cueAt(scene, props.solutionCue)}
          exit={textGone}
          width={760}
          max={64}
          style={{ left: 150, top: 600 }}
        />
        <Lift
          at={cueAt(scene, props.offlineCue)}
          exit={textGone}
          style={{
            position: 'absolute',
            left: 150,
            top: 790,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 22px 10px 16px',
            borderRadius: 999,
            background: theme.surface,
            border: `1px solid ${theme.line}`,
            fontFamily,
            fontSize: 24,
            fontWeight: 600,
            color: theme.muted,
          }}
        >
          <Icon name="blocked" size={28} color={theme.danger} strokeWidth={2} />
          <span style={{ textDecoration: 'line-through' }}>
            {story.CHAT_UI.cloud}
          </span>
        </Lift>
      </Shake>
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            background: theme.blue,
            scale: burst,
            opacity: interpolate(frame, [4, 12], [1, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        />
      </AbsoluteFill>
      <Flash at={0} peak={0.7} />
      <AbsoluteFill style={{ background: theme.blue, opacity: flood }} />
      <Disclaimers notes={story.PROMO.reveal.notes} from={beat(3)} />
      <Sfx kind="impact" at={0} />
      <Sfx kind="whoosh" at={4} />
      <Sfx kind="pop" at={beat(1)} />
      <Sfx kind="swish" at={diveFrom + 6} />
    </AbsoluteFill>
  );
};
