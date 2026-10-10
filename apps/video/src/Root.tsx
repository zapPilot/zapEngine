import type React from 'react';
import { Composition, Folder } from 'remotion';

import { timeline as calculatorTimeline } from './videos/calculator-pitch/assets';
import { CalculatorPitch } from './videos/calculator-pitch/Composition';
import { storyboard as calculatorStoryboard } from './videos/calculator-pitch/storyboard';
import { timelines as kokodeTimelines } from './videos/kokode-clinic/assets';
import { storyboard as kokodeStoryboard } from './videos/kokode-clinic/storyboard';
import { timelines as promoTimelines } from './videos/kokode-promo/assets';
import { storyboard as promoStoryboard } from './videos/kokode-promo/storyboard';
import {
  defaultVideoProps,
  storyboardMetadata,
  videoPropsSchema,
} from './videos/metadata';

// One folder per brand in Studio. Duration, fps and size come from each
// video's storyboard through calculateMetadata; the values here are
// placeholders Remotion requires.
// Loaded only when the Kokode film is opened or rendered, so the calculator
// never fetches its Japanese font.
const loadKokodeClinic = async () => ({
  default: (await import('./videos/kokode-clinic/Composition')).KokodeClinic,
});
const loadKokodePromo = async () => ({
  default: (await import('./videos/kokode-promo/Composition')).KokodePromo,
});

export const RemotionRoot: React.FC = () => (
  <>
    <Folder name="zap-pilot">
      <Composition
        id="calculator-pitch"
        component={CalculatorPitch}
        schema={videoPropsSchema}
        defaultProps={{ ...defaultVideoProps, lang: 'en' }}
        calculateMetadata={() =>
          storyboardMetadata(calculatorStoryboard, calculatorTimeline)
        }
        durationInFrames={1}
        fps={30}
        width={1920}
        height={1080}
      />
    </Folder>
    <Folder name="kokode">
      <Composition
        id="kokode-clinic"
        lazyComponent={loadKokodeClinic}
        schema={videoPropsSchema}
        defaultProps={{ ...defaultVideoProps, lang: 'ja' }}
        calculateMetadata={({ props }) =>
          storyboardMetadata(kokodeStoryboard, kokodeTimelines[props.lang])
        }
        durationInFrames={1}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="kokode-promo"
        lazyComponent={loadKokodePromo}
        schema={videoPropsSchema}
        defaultProps={{ ...defaultVideoProps, lang: 'ja' }}
        calculateMetadata={({ props }) =>
          storyboardMetadata(promoStoryboard, promoTimelines[props.lang])
        }
        durationInFrames={1}
        fps={30}
        width={1920}
        height={1080}
      />
    </Folder>
  </>
);
