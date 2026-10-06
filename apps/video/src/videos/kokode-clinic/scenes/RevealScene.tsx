import type { FC } from 'react';

import { cueAt } from '../../../timeline/beats';
import type { SceneOf } from '../assets';
import { useKokodeScene } from '../context';
import { Disclaimers } from '../primitives/Disclaimers';
import { Headline } from '../primitives/Headline';
import { StackReveal } from '../primitives/StackReveal';
import { Stage } from '../primitives/Stage';

/** The whole stack, installed by KOKODE; the team only uses the chat. */
export const RevealScene: FC<{ readonly scene: SceneOf<'reveal'> }> = ({
  scene,
}) => {
  const { story, props } = useKokodeScene(scene);
  const stackFrom = cueAt(scene, props.stackCue);
  return (
    <Stage
      copy={
        <Headline
          lines={story.BEATS[props.film.headline].title}
          eyebrow={story.BEATS.turnkey.eyebrow}
          from={stackFrom}
          size={66}
        />
      }
      screen={
        <StackReveal
          from={stackFrom}
          highlightFrom={cueAt(scene, props.teamCue)}
        />
      }
      notes={<Disclaimers notes={props.film.notes} />}
    />
  );
};
