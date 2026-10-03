import type React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { font } from '../../../brand/fonts';
import { color } from '../../../brand/tokens';
import { Kicker } from '../../../primitives/Kicker';
import { safe } from '../../../primitives/layout';
import { rise } from '../../../primitives/motion';
import { RevealText } from '../../../primitives/RevealText';
import { cueFrame } from '../../../timeline/beats';
import type { SceneOf } from '../assets';

export const HookScene: React.FC<{ readonly scene: SceneOf<'hook'> }> = ({
  scene,
}) => {
  const frame = useCurrentFrame();
  const { kicker, claim, punch, punchCue } = scene.spec.props;
  const punchAt = cueFrame(scene, 'hook', punchCue);
  return (
    <AbsoluteFill>
      <Kicker from={2}>{kicker}</Kicker>
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          paddingLeft: safe.left,
          paddingBottom: 40,
          scale: String(
            interpolate(frame, [0, scene.durationInFrames], [1, 1.035]),
          ),
          transformOrigin: '0% 50%',
        }}
      >
        <RevealText
          text={claim}
          from={8}
          style={{
            fontFamily: font.serif,
            fontSize: 150,
            lineHeight: 1.02,
            color: color.ink,
          }}
        />
        <RevealText
          text={punch}
          from={punchAt}
          stagger={5}
          style={{
            fontFamily: font.serif,
            fontStyle: 'italic',
            fontSize: 184,
            lineHeight: 1.1,
            color: color.accent,
          }}
        />
        <div
          style={{
            marginTop: 40,
            height: 2,
            width: 620 * rise(frame, punchAt + 10, 26),
            background: color.accentLine,
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
