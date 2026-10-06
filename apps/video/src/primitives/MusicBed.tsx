import { Audio } from '@remotion/media';
import { staticFile, useVideoConfig } from 'remotion';

import { type LoopId, musicLoop } from '../music/library';
import { type DuckOptions, musicVolume, type Span } from './mix';

export function MusicBed({
  loop,
  voice,
  mix,
}: {
  readonly loop: LoopId;
  readonly voice: readonly Span[];
  readonly mix: DuckOptions;
}) {
  const { fps } = useVideoConfig();
  const clip = musicLoop(loop);
  if (fps !== clip.fps)
    throw new Error('Music loop FPS differs from composition');
  return (
    <Audio
      name={`Music · ${loop}`}
      src={staticFile(`music/beds/${loop}-${mix.durationInFrames}.wav`)}
      premountFor={fps}
      volume={(frame) => musicVolume(frame, voice, mix)}
    />
  );
}
