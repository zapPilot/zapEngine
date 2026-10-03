import type React from 'react';
import { Composition } from 'remotion';

import {
  calculateCalculatorPitchMetadata,
  CalculatorPitch,
  calculatorPitchSchema,
} from './videos/calculator-pitch/Composition';

// Duration, fps and size come from each video's storyboard through
// calculateMetadata; the values here are placeholders Remotion requires.
export const RemotionRoot: React.FC = () => (
  <Composition
    id="calculator-pitch"
    component={CalculatorPitch}
    schema={calculatorPitchSchema}
    defaultProps={{ captions: true, music: true }}
    calculateMetadata={calculateCalculatorPitchMetadata}
    durationInFrames={1}
    fps={30}
    width={1920}
    height={1080}
  />
);
