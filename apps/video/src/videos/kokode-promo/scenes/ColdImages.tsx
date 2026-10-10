import type { FC } from 'react';
import { AbsoluteFill } from 'remotion';

import { glide } from '../../../primitives/motion';
import { Sfx } from '../../../primitives/Sfx';
import { cueAt } from '../../../timeline/beats';
import {
  ChatWindow,
  LockedResult,
  UserBubble,
} from '../../kokode-clinic/primitives/ChatWindow';
import { Disclaimers } from '../../kokode-clinic/primitives/Disclaimers';
import type { SceneOf } from '../assets';
import { Headline } from '../ui/Headline';
import { useSceneClock } from './clock';

/** An anatomy figure asked of a cloud AI: the result never arrives, it locks. */
export const ColdImages: FC<{ readonly scene: SceneOf<'cold-images'> }> = ({
  scene,
}) => {
  const { story, props, frame, durationInFrames } = useSceneClock(scene);
  const lockAt = cueAt(scene, props.lockCue);
  const push = glide(frame, 0, durationInFrames);
  return (
    <AbsoluteFill>
      <Headline
        lines={story.BEATS.painContent.title}
        at={cueAt(scene, props.headlineCue)}
        width={1620}
        max={92}
        style={{ left: 150, top: 96 }}
      />
      <div
        style={{
          position: 'absolute',
          left: 520,
          top: 380,
          scale: 1 + push * 0.12,
          transformOrigin: '50% 60%',
        }}
      >
        <ChatWindow variant="cloud" from={-20} width={1000}>
          <UserBubble
            text={story.DEMOS.image.prompt}
            typeFrom={4}
            variant="cloud"
          />
          <LockedResult from={14} lockFrom={lockAt} />
        </ChatWindow>
      </div>
      <Disclaimers notes={story.PROMO['cold-images'].notes} />
      <Sfx kind="type" at={4} />
      <Sfx kind="thud" at={lockAt} />
    </AbsoluteFill>
  );
};
