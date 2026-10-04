import type { FC } from 'react';

import { cueAt } from '../../../timeline/beats';
import type { SceneOf } from '../assets';
import { KokodeEndCard } from '../primitives/KokodeEndCard';

/** The ask, then the brand line and where to go. */
export const CtaScene: FC<{ readonly scene: SceneOf<'cta'> }> = ({ scene }) => {
  const { props } = scene.spec;
  return (
    <KokodeEndCard
      ask={props.film.headline}
      from={cueAt(scene, props.askCue)}
      brandFrom={cueAt(scene, props.brandCue)}
      notes={props.film.notes}
    />
  );
};
