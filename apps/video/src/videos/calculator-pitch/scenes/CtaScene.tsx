import type React from 'react';

import { EndCard } from '../../../primitives/EndCard';
import { cueFrame } from '../../../timeline/beats';
import type { SceneOf } from '../assets';
import { facts, shortHex } from '../facts';

export const CtaScene: React.FC<{ readonly scene: SceneOf<'cta'> }> = ({
  scene,
}) => {
  const { claim, punch, punchCue } = scene.spec.props;
  return (
    <EndCard
      claim={claim}
      punch={punch}
      url={facts.displayUrl}
      meta={`${facts.network} · ${shortHex(facts.address)} · Vyper ${facts.compiler}`}
      from={2}
      punchFrom={cueFrame(scene, 'cta', punchCue)}
    />
  );
};
