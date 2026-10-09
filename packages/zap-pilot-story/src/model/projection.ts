import { borderBox } from './draw-primitives.js';
import type { EngineFrame, SceneFace, TransformOp } from './scene.js';
export type Matrix4 = readonly number[];
export type Point3 = readonly [number, number, number];
export interface ProjectionLayout {
  width: number;
  height: number;
  unit: number;
  origin?: readonly [number, number];
  perspectiveOrigin?: readonly [number, number];
}
export interface ProjectedPoint {
  x: number;
  y: number;
  z: number;
  w: number;
}
export interface ProjectedFace {
  face: SceneFace;
  index: number;
  matrix: Matrix4;
  worldMatrix: Matrix4;
  homography: readonly number[];
  polygon: readonly ProjectedPoint[];
  localPolygon: readonly Point3[];
  world: readonly Point3[];
  depth: number;
  normal: Point3;
}
function unknownTransform(value: never): never {
  throw new Error(`Unknown transform: ${JSON.stringify(value)}`);
}
const I: Matrix4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const round = (value: number, digits: number) => Number(value.toFixed(digits));
export function multiply4(a: Matrix4, b: Matrix4): Matrix4 {
  return Array.from({ length: 16 }, (_, i) => {
    const r = Math.floor(i / 4),
      c = i % 4;
    return (
      a[r * 4]! * b[c]! +
      a[r * 4 + 1]! * b[c + 4]! +
      a[r * 4 + 2]! * b[c + 8]! +
      a[r * 4 + 3]! * b[c + 12]!
    );
  });
}
export function translation4(x: number, y: number, z = 0): Matrix4 {
  return [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
}
function rotation4(axis: 'RX' | 'RY' | 'RZ', degrees: number): Matrix4 {
  const angle = (degrees * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const matrices: Record<typeof axis, Matrix4> = {
    RX: [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1],
    RY: [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1],
    RZ: [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  };
  return matrices[axis];
}
function scale4(value: number): Matrix4 {
  return [value, 0, 0, 0, 0, value, 0, 0, 0, 0, value, 0, 0, 0, 0, 1];
}
export function transform4(
  ops: readonly TransformOp[],
  unit: number,
  width = 0,
  height = 0,
): Matrix4 {
  return ops.reduce((matrix, op) => {
    switch (op.k) {
      case 'T':
        return multiply4(
          matrix,
          translation4(
            round(op.x, 4) * unit,
            round(op.y, 4) * unit,
            round(op.z, 4) * unit,
          ),
        );
      case 'RX':
      case 'RY':
      case 'RZ':
        return multiply4(
          matrix,
          rotation4(
            op.k,
            op.digits === null ? op.deg : round(op.deg, op.digits),
          ),
        );
      case 'S':
        return multiply4(matrix, scale4(round(op.value, op.digits)));
      case 'anchor':
        return multiply4(
          matrix,
          translation4((width * op.x) / 100, (height * op.y) / 100),
        );
      default:
        return unknownTransform(op);
    }
  }, I);
}
export function transformPoint(matrix: Matrix4, point: Point3): ProjectedPoint {
  const [x, y, z] = point;
  const w = matrix[12]! * x + matrix[13]! * y + matrix[14]! * z + matrix[15]!;
  return {
    x: (matrix[0]! * x + matrix[1]! * y + matrix[2]! * z + matrix[3]!) / w,
    y: (matrix[4]! * x + matrix[5]! * y + matrix[6]! * z + matrix[7]!) / w,
    z: (matrix[8]! * x + matrix[9]! * y + matrix[10]! * z + matrix[11]!) / w,
    w,
  };
}
export function cameraMatrix(frame: EngineFrame, unit: number): Matrix4 {
  const camera = frame.camera;
  return multiply4(
    multiply4(
      multiply4(
        scale4(round(camera.scale, 4)),
        rotation4('RX', round(camera.ax, 2)),
      ),
      rotation4('RZ', round(camera.az, 2)),
    ),
    translation4(
      round(-camera.center[0], 4) * unit,
      round(-camera.center[1], 4) * unit,
      round(-camera.center[2], 4) * unit,
    ),
  );
}
export function perspectiveMatrix(
  frame: EngineFrame,
  layout: ProjectionLayout,
): Matrix4 {
  const origin = layout.origin ?? frame.origin,
    po = layout.perspectiveOrigin ?? frame.perspectiveOrigin;
  const px = po[0] * layout.width,
    py = po[1] * layout.height,
    d = frame.perspective * layout.unit;
  const perspective = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -1 / d, 1];
  return multiply4(
    multiply4(
      multiply4(translation4(px, py), perspective),
      translation4(-px, -py),
    ),
    translation4(origin[0] * layout.width, origin[1] * layout.height),
  );
}
export function homography(matrix: Matrix4): readonly number[] {
  return [
    matrix[0]!,
    matrix[1]!,
    matrix[3]!,
    matrix[4]!,
    matrix[5]!,
    matrix[7]!,
    matrix[12]!,
    matrix[13]!,
    matrix[15]!,
  ];
}
export function projectFace(
  frame: EngineFrame,
  face: SceneFace,
  index: number,
  layout: ProjectionLayout,
): ProjectedFace {
  const local = transform4(face.ops, layout.unit);
  const camera = multiply4(cameraMatrix(frame, layout.unit), local);
  const matrix = multiply4(perspectiveMatrix(frame, layout), camera);
  // The polygon is the box the face draws, so a line keeps the height of its borders.
  const { w, h } = borderBox(face, layout.unit);
  let corners: Point3[] = [
    [0, 0, 0],
    [w, 0, 0],
    [w, h, 0],
    [0, h, 0],
  ];
  if (face.clip.k === 'triangle') {
    corners = [
      [0, 0, 0],
      [w, 0, 0],
      [w / 2, h, 0],
    ];
  } else if (face.clip.k === 'hexagon') {
    corners = [
      [w, h / 2, 0],
      [w * 0.75, h * 0.933, 0],
      [w * 0.25, h * 0.933, 0],
      [0, h / 2, 0],
      [w * 0.25, h * 0.067, 0],
      [w * 0.75, h * 0.067, 0],
    ];
  } else if (
    face.clip.k === 'circle' ||
    (face.radius.k === 'percent' && face.radius.n === 50)
  ) {
    const radius = Math.min(w, h) / 2;
    corners = Array.from({ length: 64 }, (_, i) => {
      const angle = (i * Math.PI) / 32;
      return [
        w / 2 + radius * Math.cos(angle),
        h / 2 + radius * Math.sin(angle),
        0,
      ];
    });
  }
  const world = corners.map((p) => {
    const q = transformPoint(camera, p);
    return [q.x, q.y, q.z] as const;
  });
  // The local z-axis remains well defined for border-only faces of zero height.
  const magnitude = Math.hypot(camera[2]!, camera[6]!, camera[10]!);
  const normal: Point3 = [
    camera[2]! / magnitude,
    camera[6]! / magnitude,
    camera[10]! / magnitude,
  ];
  return {
    face,
    index,
    matrix,
    worldMatrix: camera,
    homography: homography(matrix),
    localPolygon: corners,
    polygon: corners.map((p) => transformPoint(matrix, p)),
    world,
    depth: world.reduce((n, p) => n + p[2], 0) / world.length,
    normal,
  };
}
export function projectFaces(
  frame: EngineFrame,
  layout: ProjectionLayout,
): readonly ProjectedFace[] {
  return frame.faces.map((face, index) =>
    projectFace(frame, face, index, layout),
  );
}
export function projectBillboard(
  frame: EngineFrame,
  anchor: readonly number[],
  layout: ProjectionLayout,
) {
  const camera = cameraMatrix(frame, layout.unit);
  const position = transformPoint(camera, [
    round(anchor[0]!, 4) * layout.unit,
    round(anchor[1]!, 4) * layout.unit,
    round(anchor[2]!, 4) * layout.unit,
  ]);
  const point = transformPoint(perspectiveMatrix(frame, layout), [
    position.x,
    position.y,
    position.z,
  ]);
  return {
    ...point,
    scale:
      (frame.perspective * layout.unit) /
      (frame.perspective * layout.unit - position.z),
  };
}
