import { useCurrentFrame, useVideoConfig } from 'remotion';

import { beatFrame } from '../../../timeline/grid';
import { usePromoScene } from '../context';

/**
 * What a scene reads on every frame: its copy and props, the frame, its
 * length, and `beat(n)`, the scene frame of beat n on the music's grid.
 */
export function useSceneClock<Props>(scene: {
  readonly from: number;
  readonly spec: { readonly props: Props };
}) {
  const context = usePromoScene(scene);
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const beat = (n: number) => beatFrame(scene.from, n, context.perBeat);
  return { ...context, frame, durationInFrames, fps, beat };
}
