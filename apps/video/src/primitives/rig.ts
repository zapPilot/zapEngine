/**
 * A camera for an object in perspective, expressed the other way round: the
 * object moves. A key says which point of it (`fx`, `fy`, CSS px of its face)
 * lands where in the frame (`x`, `y`), how big it is there and how it is
 * turned. Rotations and scale pivot on that point, so a push-in on a button
 * keeps the button still while everything around it swings.
 */
export interface RigKey {
  readonly at: number;
  readonly fx: number;
  readonly fy: number;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rx: number;
  readonly ry: number;
  readonly rz: number;
  /** Towards the viewer, px. */
  readonly z: number;
  /** Curve for the move that arrives at this key, instead of the rig's default. */
  readonly ease?: (t: number) => number;
}

export type RigPose = Omit<RigKey, 'at' | 'ease'>;

/** Centred on the 1920×1080 frame, upright, life-size; focus on the face's origin. */
export const REST: RigPose = {
  fx: 0,
  fy: 0,
  x: 960,
  y: 540,
  scale: 1,
  rx: 0,
  ry: 0,
  rz: 0,
  z: 0,
};

/** A key with rest values for everything `pose` leaves out. */
export function key(
  at: number,
  pose: Partial<RigPose> & { readonly ease?: (t: number) => number } = {},
): RigKey {
  return { at, ...REST, ...pose };
}

/** Two keys with one pose: the object waits there from `from` until `to`. */
export function hold(
  from: number,
  to: number,
  pose: Partial<RigPose> = {},
): readonly [RigKey, RigKey] {
  return [key(from, pose), key(to, pose)];
}

/**
 * The pose at `frame`: holds the first and last keys, eases between
 * neighbours. Scale moves geometrically, so 1× → 2× feels as even as 2× → 4×.
 */
export function rigAt(
  keys: readonly RigKey[],
  frame: number,
  ease: (t: number) => number,
): RigPose {
  const [first] = keys;
  if (!first) throw new Error('A rig needs at least one key');
  let from = first;
  let to = first;
  for (const candidate of keys) {
    if (candidate.at <= frame) from = candidate;
    if (candidate.at >= frame) {
      to = candidate;
      break;
    }
    to = candidate;
  }
  const span = to.at - from.at;
  const curve = to.ease ?? ease;
  const t =
    span > 0 ? curve(Math.min(1, Math.max(0, (frame - from.at) / span))) : 1;
  const mix = (a: number, b: number) => a + (b - a) * t;
  return {
    fx: mix(from.fx, to.fx),
    fy: mix(from.fy, to.fy),
    x: mix(from.x, to.x),
    y: mix(from.y, to.y),
    scale: from.scale * (to.scale / from.scale) ** t,
    rx: mix(from.rx, to.rx),
    ry: mix(from.ry, to.ry),
    rz: mix(from.rz, to.rz),
    z: mix(from.z, to.z),
  };
}

/**
 * CSS that puts an object in a pose: its focus point sits at (`x`, `y`) of
 * the parent and every rotation and the scale pivot on it. `inset` is where
 * the face the focus point refers to starts inside the object (a screen
 * inside its bezel, a page below a toolbar).
 */
export function rigStyle(
  pose: RigPose,
  inset: { readonly x: number; readonly y: number } = { x: 0, y: 0 },
) {
  const ox = inset.x + pose.fx;
  const oy = inset.y + pose.fy;
  return {
    left: pose.x - ox,
    top: pose.y - oy,
    transformOrigin: `${ox}px ${oy}px`,
    transform: `translateZ(${pose.z}px) rotateX(${pose.rx}deg) rotateY(${pose.ry}deg) rotateZ(${pose.rz}deg) scale(${pose.scale})`,
  };
}

/** Blur in px for a fast whip, from how far the pose travelled in one frame. */
export function whipBlur(pose: RigPose, before: RigPose): number {
  const travel =
    Math.hypot(pose.x - before.x, pose.y - before.y) +
    Math.abs(pose.ry - before.ry) * 6 +
    Math.abs(pose.rz - before.rz) * 6;
  return Math.min(9, Math.max(0, (travel - 28) * 0.08));
}
