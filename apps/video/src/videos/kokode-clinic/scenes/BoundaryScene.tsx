import type { FC } from 'react';

import { cueAt } from '../../../timeline/beats';
import type { SceneOf } from '../assets';
import { useKokodeScene } from '../context';
import { BoundaryPhone } from '../primitives/BoundaryPhone';
import { Disclaimers } from '../primitives/Disclaimers';
import { Headline } from '../primitives/Headline';
import { NetworkDiagram } from '../primitives/NetworkDiagram';
import { Stage } from '../primitives/Stage';

/** Usable on the staff network, after login; from outside it does not connect. */
export const BoundaryScene: FC<{ readonly scene: SceneOf<'boundary'> }> = ({
  scene,
}) => {
  const { story, props } = useKokodeScene(scene);
  const insideFrom = cueAt(scene, props.insideCue);
  return (
    <Stage
      copy={
        <Headline
          lines={story.BEATS[props.film.headline].title}
          eyebrow={story.BEATS.boundary.eyebrow}
          from={0}
          size={68}
        />
      }
      screen={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 44 }}>
          <NetworkDiagram from={insideFrom - 12} />
          <BoundaryPhone from={cueAt(scene, props.outsideCue)} />
        </div>
      }
      notes={<Disclaimers notes={props.film.notes} />}
    />
  );
};
