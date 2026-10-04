import type { FC } from 'react';

import { cueAt } from '../../../timeline/beats';
import type { SceneOf } from '../assets';
import { Disclaimers } from '../primitives/Disclaimers';
import { JaHeadline } from '../primitives/JaHeadline';
import { StackReveal } from '../primitives/StackReveal';
import { Stage } from '../primitives/Stage';
import { BEATS } from '../story';

/** The whole stack, installed by KOKODE; the team only uses the chat. */
export const RevealScene: FC<{ readonly scene: SceneOf<'reveal'> }> = ({
  scene,
}) => {
  const { props } = scene.spec;
  const stackFrom = cueAt(scene, props.stackCue);
  return (
    <Stage
      copy={
        <JaHeadline
          lines={props.film.headline}
          eyebrow={BEATS.turnkey.eyebrow}
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
