import type { FC } from 'react';

import { color } from '../../brand/tokens';
import { Backdrop, Grain } from '../../primitives/Backdrop';
import {
  NarratedVideo,
  type SceneComponents,
} from '../../primitives/NarratedVideo';
import type { VideoProps } from '../metadata';
import { timeline } from './assets';
import { CtaScene } from './scenes/CtaScene';
import { DeployScene } from './scenes/DeployScene';
import { HookScene } from './scenes/HookScene';
import { InputsScene } from './scenes/InputsScene';
import { ProofScene } from './scenes/ProofScene';
import { RuleScene } from './scenes/RuleScene';
import { ScenarioScene } from './scenes/ScenarioScene';
import { ScopeScene } from './scenes/ScopeScene';
import { type CalculatorScene, storyboard } from './storyboard';

// Exhaustive by type: adding a scene id to the storyboard without a
// component here fails type-check.
const SCENES: SceneComponents<CalculatorScene> = {
  hook: HookScene,
  rule: RuleScene,
  inputs: InputsScene,
  proof: ProofScene,
  scenario: ScenarioScene,
  deploy: DeployScene,
  scope: ScopeScene,
  cta: CtaScene,
};

export const CalculatorPitch: FC<VideoProps> = ({ captions, music }) => (
  <NarratedVideo
    storyboard={storyboard}
    timeline={timeline}
    scenes={SCENES}
    captions={captions}
    music={music}
    background={color['ground']}
    backdrop={<Backdrop />}
    overlay={<Grain />}
  />
);
