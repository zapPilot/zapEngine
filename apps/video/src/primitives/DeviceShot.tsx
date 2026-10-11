import type { ReactNode } from 'react';
import { AbsoluteFill, Easing, useCurrentFrame } from 'remotion';

import { rigAt, type RigKey, type RigPose, whipBlur } from './rig';

const cameraEase = Easing.bezier(0.65, 0, 0.35, 1);

/**
 * An object on the rig. Each shot owns its perspective, so a fast whip can be
 * blurred as a flat layer without flattening the object's own depth; the
 * child receives the pose to place itself (`rigStyle`) and catch the light.
 */
export function DeviceShot({
  keys,
  ease = cameraEase,
  perspective = 2400,
  children,
}: {
  readonly keys: readonly RigKey[];
  readonly ease?: (t: number) => number;
  readonly perspective?: number;
  readonly children: (pose: RigPose) => ReactNode;
}) {
  const frame = useCurrentFrame();
  const pose = rigAt(keys, frame, ease);
  const blur = whipBlur(pose, rigAt(keys, frame - 1, ease));
  return (
    <AbsoluteFill
      style={{
        perspective,
        perspectiveOrigin: '50% 50%',
        filter: blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : undefined,
      }}
    >
      {children(pose)}
    </AbsoluteFill>
  );
}
