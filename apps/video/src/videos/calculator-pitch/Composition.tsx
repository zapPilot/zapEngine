import { Audio } from '@remotion/media';
import { linearTiming, TransitionSeries } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { type FC, Fragment } from 'react';
import {
  AbsoluteFill,
  type CalculateMetadataFunction,
  staticFile,
  useVideoConfig,
} from 'remotion';
import { z } from 'zod';

import { font } from '../../brand/fonts';
import { color } from '../../brand/tokens';
import { Backdrop, Grain } from '../../primitives/Backdrop';
import { Captions } from '../../primitives/Captions';
import { musicVolume } from '../../primitives/mix';
import type { TimedScene } from '../../timeline/timeline';
import { type SceneOf, timeline } from './assets';
import { CtaScene } from './scenes/CtaScene';
import { DeployScene } from './scenes/DeployScene';
import { HookScene } from './scenes/HookScene';
import { InputsScene } from './scenes/InputsScene';
import { ProofScene } from './scenes/ProofScene';
import { RuleScene } from './scenes/RuleScene';
import { ScenarioScene } from './scenes/ScenarioScene';
import { ScopeScene } from './scenes/ScopeScene';
import { type CalculatorScene, storyboard } from './storyboard';

export const calculatorPitchSchema = z.object({
  captions: z.boolean(),
  music: z.boolean(),
});

type Props = z.infer<typeof calculatorPitchSchema>;

type SceneComponents = {
  readonly [Id in CalculatorScene['id']]: FC<{
    readonly scene: SceneOf<Id>;
  }>;
};

// Exhaustive by type: adding a scene id to the storyboard without a
// component here fails type-check.
const SCENES: SceneComponents = {
  hook: HookScene,
  rule: RuleScene,
  inputs: InputsScene,
  proof: ProofScene,
  scenario: ScenarioScene,
  deploy: DeployScene,
  scope: ScopeScene,
  cta: CtaScene,
};

function renderScene(scene: TimedScene<CalculatorScene>) {
  // The map is keyed by the same id the scene carries, so this widening is
  // safe; TypeScript cannot correlate the two through the union.
  const Scene = SCENES[scene.spec.id] as FC<{
    readonly scene: TimedScene<CalculatorScene>;
  }>;
  return <Scene scene={scene} />;
}

const MUSIC = {
  base: 0.3,
  ducked: 0.09,
  ramp: 8,
  fadeIn: 20,
  fadeOut: 50,
  durationInFrames: timeline.durationInFrames,
} as const;

/** Narration lines still sized by estimate: visible in Studio, never rendered. */
const EstimateWarning: FC = () =>
  timeline.estimatedLines.length === 0 ? null : (
    <AbsoluteFill style={{ alignItems: 'flex-end', padding: 24 }}>
      <span
        style={{
          padding: '8px 16px',
          borderRadius: 8,
          background: color.danger,
          color: color.bg,
          fontFamily: font.mono,
          fontSize: 20,
        }}
      >
        Estimated narration: {timeline.estimatedLines.join(', ')} — run pnpm
        voiceover
      </span>
    </AbsoluteFill>
  );

export const CalculatorPitch: FC<Props> = ({ captions, music }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: color.bg }}>
      <Backdrop />
      <TransitionSeries>
        {timeline.scenes.map((scene, index) => (
          <Fragment key={scene.spec.id}>
            {index > 0 ? (
              <TransitionSeries.Transition
                presentation={fade()}
                timing={linearTiming({
                  durationInFrames: storyboard.transitionFrames,
                })}
              />
            ) : null}
            <TransitionSeries.Sequence
              name={scene.spec.id}
              durationInFrames={scene.durationInFrames}
              premountFor={fps}
            >
              {renderScene(scene)}
            </TransitionSeries.Sequence>
          </Fragment>
        ))}
      </TransitionSeries>
      <Grain />
      {timeline.voice.map((clip) => (
        <Audio
          key={clip.lineId}
          name={`Narration · ${clip.lineId}`}
          src={staticFile(clip.file)}
          from={clip.from}
          premountFor={fps}
        />
      ))}
      {music ? (
        <Audio
          name="Music bed"
          src={staticFile('music/bgm-03.mp3')}
          loop
          loopVolumeCurveBehavior="extend"
          volume={(frame) => musicVolume(frame, timeline.voice, MUSIC)}
        />
      ) : null}
      {captions ? <Captions cues={timeline.captions} /> : null}
      <EstimateWarning />
    </AbsoluteFill>
  );
};

export const calculateCalculatorPitchMetadata: CalculateMetadataFunction<
  Props
> = () => ({
  durationInFrames: timeline.durationInFrames,
  fps: storyboard.fps,
  width: storyboard.width,
  height: storyboard.height,
  defaultOutName: storyboard.id,
});
