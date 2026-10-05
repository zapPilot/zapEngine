import type { FC } from 'react';

import { cueAt } from '../../../timeline/beats';
import type { SceneOf } from '../assets';
import { useKokodeScene } from '../context';
import { KokodeEndCard } from '../primitives/KokodeEndCard';

/** The ask, then the brand line and where to go. */
export const CtaScene: FC<{ readonly scene: SceneOf<'cta'> }> = ({ scene }) => {
  const { story, props } = useKokodeScene(scene);
  return (
    <KokodeEndCard
      ask={story.BEATS[props.film.headline].title}
      from={cueAt(scene, props.askCue)}
      brandFrom={cueAt(scene, props.brandCue)}
      notes={props.film.notes}
    />
  );
};
