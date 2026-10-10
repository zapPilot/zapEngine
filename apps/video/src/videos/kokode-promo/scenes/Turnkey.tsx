import type { FC } from 'react';
import { AbsoluteFill, Easing, interpolate } from 'remotion';

import { DeviceShot } from '../../../primitives/DeviceShot';
import { Slam } from '../../../primitives/Kinetic';
import { key, rigStyle } from '../../../primitives/rig';
import { Sfx } from '../../../primitives/Sfx';
import { fitFontSize } from '../../../primitives/text';
import { cueAt } from '../../../timeline/beats';
import { Disclaimers } from '../../kokode-clinic/primitives/Disclaimers';
import { theme } from '../../kokode-clinic/theme';
import type { SceneOf } from '../assets';
import { Headline } from '../ui/Headline';
import { BOX_CENTRE, KokodeBox } from '../ui/KokodeBox';
import { LayerStack } from '../ui/LayerStack';
import { headline } from '../ui/look';
import { Wall } from '../ui/Wall';
import { useSceneClock } from './clock';

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const PILL_COLOURS = [theme.blue, theme.dark, theme.blue] as const;

/**
 * The montage runs on the music: every screen on a tilted wall, a word per
 * bar. Then everything KOKODE installs drops onto the device, layer by layer.
 */
export const Turnkey: FC<{ readonly scene: SceneOf<'turnkey'> }> = ({
  scene,
}) => {
  const { story, props, fontFamily, lang, perBeat, frame, beat } =
    useSceneClock(scene);
  const pills = story.PROMO_UI.pills;
  // One word per bar; the last bar is cut short by the stack.
  const stackFrom = beat(pills.length * 4 - 2);
  const hardwareAt = cueAt(scene, props.stackCue);
  const landAt = [
    props.modelCue,
    props.knowledgeCue,
    props.agentsCue,
    props.chatCue,
  ].map((cue) => cueAt(scene, cue));
  const keys = [
    key(stackFrom, {
      ...BOX_CENTRE,
      x: 1250,
      y: 1060,
      rx: 64,
      ry: -34,
      rz: 10,
      scale: 0.86,
    }),
    key(stackFrom + 14, {
      ...BOX_CENTRE,
      x: 1260,
      y: 760,
      rx: 62,
      ry: -24,
      rz: 8,
      scale: 0.92,
      ease: Easing.bezier(0.2, 1.25, 0.35, 1),
    }),
    key(stackFrom + 220, {
      ...BOX_CENTRE,
      x: 1240,
      y: 760,
      rx: 60,
      ry: -8,
      rz: 4,
      scale: 0.92,
    }),
  ];
  return (
    <AbsoluteFill style={{ fontFamily }}>
      {frame < stackFrom ? (
        <>
          <Wall from={0} perBeat={perBeat} />
          {pills.map((word, index) => {
            const at = beat(index * 4);
            const until = beat(index * 4 + 4);
            if (frame < at - 3 || frame >= until) return null;
            const size = fitFontSize([word], 900, 190);
            const grow = interpolate(frame, [at - 3, at + 6], [0.6, 1], {
              ...CLAMP,
              easing: Easing.out(Easing.back(1.6)),
            });
            return (
              <AbsoluteFill
                key={word}
                style={{ alignItems: 'center', justifyContent: 'center' }}
              >
                <div
                  style={{
                    padding: `${size * 0.22}px ${size * 0.42}px`,
                    borderRadius: size * 0.36,
                    background: PILL_COLOURS[index % PILL_COLOURS.length],
                    boxShadow: '0 40px 90px rgba(0, 0, 0, 0.28)',
                    scale: grow,
                  }}
                >
                  <Slam
                    text={word}
                    at={at}
                    look={headline(fontFamily, lang, size, theme.surface)}
                  />
                </div>
              </AbsoluteFill>
            );
          })}
        </>
      ) : (
        <>
          <DeviceShot keys={keys}>
            {(pose) => (
              <KokodeBox
                light={pose.ry}
                glow={interpolate(
                  frame,
                  [hardwareAt, hardwareAt + 8],
                  [0.3, 1],
                  CLAMP,
                )}
                style={rigStyle(pose)}
              >
                <LayerStack landAt={landAt} />
              </KokodeBox>
            )}
          </DeviceShot>
          <Headline
            lines={story.BEATS.turnkey.title}
            at={cueAt(scene, props.setupCue)}
            width={720}
            max={76}
            style={{ left: 150, top: 220 }}
          />
          <Headline
            lines={story.BEATS.ownership.title}
            at={cueAt(scene, props.ownCue)}
            width={720}
            max={50}
            color={theme.blue}
            style={{ left: 150, top: 520 }}
          />
          <Disclaimers notes={story.PROMO.turnkey.notes} from={stackFrom} />
        </>
      )}
      {pills.map((word, index) => (
        <Sfx
          key={word}
          kind={index === 0 ? 'impact' : 'thud'}
          at={beat(index * 4)}
        />
      ))}
      <Sfx kind="whoosh" at={stackFrom} />
      {landAt.map((at) => (
        <Sfx key={at} kind="pop" at={at} />
      ))}
    </AbsoluteFill>
  );
};
