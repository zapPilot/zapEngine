import { Audio } from '@remotion/media';
import type { FC } from 'react';
import { staticFile, useVideoConfig } from 'remotion';

import { sfxFile, type SfxKind } from './sfx-kinds';

/** A synthesised sound effect starting at scene frame `at`. */
export const Sfx: FC<{
  readonly kind: SfxKind;
  readonly at: number;
  /** 0–1 on top of the effect's own level. */
  readonly volume?: number;
}> = ({ kind, at, volume = 1 }) => {
  const { fps } = useVideoConfig();
  return (
    <Audio
      name={`SFX · ${kind}`}
      src={staticFile(sfxFile(kind))}
      from={Math.round(at)}
      volume={volume}
      premountFor={fps}
    />
  );
};
