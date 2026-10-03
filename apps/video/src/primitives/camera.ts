export interface Size {
  readonly width: number;
  readonly height: number;
}
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Maps image CSS pixels to frame pixels: a point (px, py) on the capture
 * lands at (x + px * scale, y + py * scale).
 */
export interface Camera {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

export interface FocusOptions {
  /** Share of the frame the box should fill along its tighter axis. */
  readonly fill?: number;
  /** Where the box centre lands, as fractions of the frame. */
  readonly anchor?: { readonly x: number; readonly y: number };
  /** Upper bound, usually the capture's device pixel ratio (1:1 pixels). */
  readonly maxScale?: number;
  /**
   * Keep the image covering the whole frame (page captures). Element
   * captures float as cards, so their edges may show.
   */
  readonly cover?: boolean;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const coverScale = (image: Size, frame: Size) =>
  Math.max(frame.width / image.width, frame.height / image.height);

/** Places `box` at `anchor`, sized to `fill` of the frame. */
export function focusCamera(
  box: Box,
  image: Size,
  frame: Size,
  options: FocusOptions = {},
): Camera {
  const {
    fill = 0.7,
    anchor = { x: 0.5, y: 0.5 },
    maxScale = Number.POSITIVE_INFINITY,
    cover = true,
  } = options;
  const wanted = Math.min(
    (frame.width * fill) / box.width,
    (frame.height * fill) / box.height,
  );
  const minScale = cover ? coverScale(image, frame) : 0;
  const scale = clamp(wanted, minScale, Math.max(minScale, maxScale));
  const x = frame.width * anchor.x - (box.x + box.width / 2) * scale;
  const y = frame.height * anchor.y - (box.y + box.height / 2) * scale;
  if (!cover) return { scale, x, y };
  return {
    scale,
    x: clamp(x, frame.width - image.width * scale, 0),
    y: clamp(y, frame.height - image.height * scale, 0),
  };
}

/** The whole capture, edge to edge. */
export function fullCamera(image: Size, frame: Size): Camera {
  return focusCamera(
    { x: 0, y: 0, width: image.width, height: image.height },
    image,
    frame,
    { fill: 1 },
  );
}

/** The whole capture fitted inside `region`, centred: a floating card. */
export function containCamera(image: Size, region: Box): Camera {
  const scale = Math.min(
    region.width / image.width,
    region.height / image.height,
  );
  return {
    scale,
    x: region.x + (region.width - image.width * scale) / 2,
    y: region.y + (region.height - image.height * scale) / 2,
  };
}

/**
 * Blends two cameras. Zoom moves geometrically so a 1x→4x push feels as even
 * as 2x→8x, and the point at the frame centre glides in a straight line.
 */
export function mixCamera(
  from: Camera,
  to: Camera,
  progress: number,
  frame: Size,
): Camera {
  const t = clamp(progress, 0, 1);
  const scale = from.scale * (to.scale / from.scale) ** t;
  const centre = (camera: Camera, axis: 'x' | 'y') =>
    ((axis === 'x' ? frame.width : frame.height) / 2 - camera[axis]) /
    camera.scale;
  const cx = centre(from, 'x') + (centre(to, 'x') - centre(from, 'x')) * t;
  const cy = centre(from, 'y') + (centre(to, 'y') - centre(from, 'y')) * t;
  return {
    scale,
    x: frame.width / 2 - cx * scale,
    y: frame.height / 2 - cy * scale,
  };
}

export interface CameraStop {
  readonly at: number;
  readonly camera: Camera;
}

/**
 * The camera at `time` for a list of stops: it holds each framing and spends
 * the `move` frames before the next stop travelling there.
 */
export function cameraAt(
  stops: readonly CameraStop[],
  time: number,
  move: number,
  frame: Size,
  ease: (t: number) => number,
): Camera {
  const [first, ...rest] = stops;
  if (first === undefined) throw new Error('A camera needs at least one stop.');
  let camera = first.camera;
  for (const stop of rest) {
    const start = stop.at - move;
    if (time <= start) break;
    const progress = move > 0 ? Math.min(1, (time - start) / move) : 1;
    camera = mixCamera(camera, stop.camera, ease(progress), frame);
  }
  return camera;
}

/** Where a capture-space box appears in the frame under `camera`. */
export function projectBox(box: Box, camera: Camera): Box {
  return {
    x: camera.x + box.x * camera.scale,
    y: camera.y + box.y * camera.scale,
    width: box.width * camera.scale,
    height: box.height * camera.scale,
  };
}
