import type { FC } from 'react';
import { AbsoluteFill, interpolate } from 'remotion';

import { Slam } from '../../../primitives/Kinetic';
import { rise } from '../../../primitives/motion';
import { Sfx } from '../../../primitives/Sfx';
import { fitFontSize } from '../../../primitives/text';
import { cueAt } from '../../../timeline/beats';
import { theme } from '../../kokode-clinic/theme';
import type { SceneOf } from '../assets';
import { headline } from '../ui/look';
import { useSceneClock } from './clock';

/** Black. What we want, slammed in white; a blue point appears: here. */
export const Turn: FC<{ readonly scene: SceneOf<'turn'> }> = ({ scene }) => {
  const { story, props, fontFamily, lang, frame, durationInFrames, fps } =
    useSceneClock(scene);
  const [first = '', second = ''] = story.BEATS.desiredWorld.title;
  const look = headline(
    fontFamily,
    lang,
    fitFontSize([first, second], 1560, 124),
    theme.surface,
  );
  const dotAt = cueAt(scene, props.controlCue) + 18;
  const dot = rise(frame, dotAt, 10);
  const pulse = 1 + Math.sin((frame - dotAt) / 5) * 0.08 * dot;
  const grow = interpolate(
    frame,
    [durationInFrames - 10, durationInFrames],
    [1, 1.6],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    },
  );
  return (
    <AbsoluteFill
      style={{
        background: theme.dark,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 18,
          marginTop: -60,
        }}
      >
        <Slam text={first} at={cueAt(scene, props.desireCue)} look={look} />
        <Slam
          text={second}
          at={cueAt(scene, props.controlCue)}
          look={{ ...look, color: '#a1a1a6' }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 960 - 22,
          top: 860,
          width: 44,
          height: 44,
          borderRadius: 22,
          background: theme.blue,
          opacity: dot,
          scale: dot * pulse * grow,
          boxShadow: `0 0 ${40 * dot}px rgba(0, 113, 227, 0.8)`,
        }}
      />
      <Sfx
        kind="riser"
        at={Math.max(0, durationInFrames - Math.round(1.6 * fps))}
      />
    </AbsoluteFill>
  );
};
