import { Audio } from '@remotion/media';
import { linearTiming, TransitionSeries } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { type CSSProperties, type FC, Fragment, type ReactNode } from 'react';
import { AbsoluteFill, staticFile, useVideoConfig } from 'remotion';

import { font } from '../brand/fonts';
import { color } from '../brand/tokens';
import type { TimedScene, Timeline } from '../timeline/timeline';
import type { SceneSpec, Storyboard } from '../timeline/types';
import { Captions } from './Captions';
import { MusicBed } from './MusicBed';

/**
 * One component per scene id. Exhaustive by type: a storyboard scene without
 * a component fails type-check.
 */
export type SceneComponents<Scene extends SceneSpec> = {
  readonly [Id in Scene['id']]: FC<{
    readonly scene: TimedScene<Extract<Scene, { id: Id }>>;
  }>;
};

export interface NarratedVideoProps<Scene extends SceneSpec> {
  readonly storyboard: Storyboard<Scene>;
  readonly timeline: Timeline<Scene>;
  readonly scenes: SceneComponents<Scene>;
  readonly captions: boolean;
  readonly music: boolean;
  /** Fill behind everything. */
  readonly background: string;
  /** Laid under the scenes. */
  readonly backdrop?: ReactNode;
  /** Laid over the scenes, under the captions. */
  readonly overlay?: ReactNode;
  readonly captionStyle?: CSSProperties;
}

const MUSIC = {
  base: 0.5,
  ducked: 0.17,
  fadeIn: 30,
  fadeOut: 60,
} as const;

/** Narration lines still sized by estimate: visible in Studio, never rendered. */
const EstimateWarning: FC<{ readonly lines: readonly string[] }> = ({
  lines,
}) =>
  lines.length === 0 ? null : (
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
        Estimated narration: {lines.join(', ')} — run pnpm voiceover
      </span>
    </AbsoluteFill>
  );

/**
 * A storyboard played end to end: its scenes cross-faded in order, the
 * narration on the timeline's clock, a music bed that ducks under the voice,
 * and burned-in captions. A video supplies only how each scene looks.
 */
export function NarratedVideo<Scene extends SceneSpec>({
  storyboard,
  timeline,
  scenes,
  captions,
  music,
  background,
  backdrop,
  overlay,
  captionStyle,
}: NarratedVideoProps<Scene>) {
  const { fps } = useVideoConfig();
  const mix = {
    ...MUSIC,
    ...storyboard.music,
    attack: Math.round(fps * 0.25),
    release: Math.round(fps * 0.8),
    durationInFrames: timeline.durationInFrames,
  };
  return (
    <AbsoluteFill style={{ backgroundColor: background }}>
      {backdrop}
      <TransitionSeries>
        {timeline.scenes.map((scene, index) => {
          // The map is keyed by the id the scene carries, so this widening
          // is safe; TypeScript cannot correlate the two through the union.
          const View = scenes[scene.spec.id as Scene['id']] as FC<{
            readonly scene: TimedScene<Scene>;
          }>;
          return (
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
                <View scene={scene} />
              </TransitionSeries.Sequence>
            </Fragment>
          );
        })}
      </TransitionSeries>
      {overlay}
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
        <MusicBed
          loop={storyboard.music.loop}
          voice={timeline.voice}
          mix={mix}
        />
      ) : null}
      {captions ? (
        <Captions cues={timeline.captions} style={captionStyle} />
      ) : null}
      <EstimateWarning lines={timeline.estimatedLines} />
    </AbsoluteFill>
  );
}
