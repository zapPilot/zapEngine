import {
  transformPoint,
  type Point3,
  type ProjectedFace,
  type ProjectedPoint,
} from './projection.js';
export interface FaceFragment extends ProjectedFace {
  localPolygon: readonly Point3[];
  fragment: number;
}
/** `before` paints under `after`, which stands up to `cost` screen depth in front of it. */
export interface PaintConstraint {
  before: number;
  after: number;
  cost: number;
}
const dot = (a: Point3, b: Point3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Point3, b: Point3): Point3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
interface Vertex {
  readonly x: number;
  readonly y: number;
}
/** A fragment with everything its pair tests reuse, computed once per fragment. */
interface Plate {
  readonly fragment: FaceFragment;
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** Edge normals as x, y pairs, with the polygon's own extent along each. */
  readonly axes: readonly number[];
  readonly low: readonly number[];
  readonly high: readonly number[];
  /** Orientation of the polygon, for clipping other polygons against it. */
  readonly winding: number;
  /** The first fan triangle with area, which interpolates depth over the plane. */
  readonly corners:
    | readonly [ProjectedPoint, ProjectedPoint, ProjectedPoint]
    | null;
  /** Sign that points the plane's normal towards the eye. */
  readonly side: number;
  /** A line: a 0-height face drawn by its borders alone. */
  readonly thin: boolean;
  /** Fill and size allow this face to be split or to split others. */
  readonly divisible: boolean;
}
function project(polygon: readonly Vertex[], nx: number, ny: number) {
  let low = Infinity,
    high = -Infinity;
  for (const v of polygon) {
    const distance = v.x * nx + v.y * ny;
    low = Math.min(low, distance);
    high = Math.max(high, distance);
  }
  return [low, high] as const;
}
function prepare(fragment: FaceFragment, eye: Point3): Plate {
  const polygon = fragment.polygon;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const p of polygon) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const axes: number[] = [],
    low: number[] = [],
    high: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!,
      q = polygon[(i + 1) % polygon.length]!,
      nx = p.y - q.y,
      ny = q.x - p.x;
    if (Math.hypot(nx, ny) < 1e-9) {
      continue;
    }
    const [lo, hi] = project(polygon, nx, ny);
    axes.push(nx, ny);
    low.push(lo);
    high.push(hi);
  }
  const area = polygon.reduce((sum, p, i) => {
    const q = polygon[(i + 1) % polygon.length]!;
    return sum + p.x * q.y - q.x * p.y;
  }, 0);
  const a = polygon[0]!;
  let corners: Plate['corners'] = null;
  for (let i = 1; corners === null && i + 1 < polygon.length; i++) {
    const b = polygon[i]!,
      c = polygon[i + 1]!;
    if (
      Math.abs((b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y)) < 1e-9
    ) {
      continue;
    }
    corners = [a, b, c];
  }
  const origin = fragment.world[0]!,
    thin = fragment.face.h === 0;
  return {
    fragment,
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    axes,
    low,
    high,
    winding: area >= 0 ? 1 : -1,
    corners,
    side: dot(sub(eye, origin), fragment.normal) >= 0 ? 1 : -1,
    thin,
    // Lines split by the area of their border box, whatever their fill.
    divisible: thin
      ? hasArea(fragment.localPolygon)
      : !['transparent', 'radialShadow'].includes(fragment.face.fill.k) &&
        fragment.face.h > 0,
  };
}
// Whether one of `own`'s edge normals separates the two polygons on screen.
function separates(own: Plate, other: Plate) {
  for (let k = 0; k < own.low.length; k++) {
    const [low, high] = project(
      other.fragment.polygon,
      own.axes[2 * k]!,
      own.axes[2 * k + 1]!,
    );
    if (own.high[k]! <= low + 1e-7 || high <= own.low[k]! + 1e-7) {
      return true;
    }
  }
  return false;
}
function overlaps(a: Plate, b: Plate) {
  if (
    a.minX >= b.maxX - 0.001 ||
    b.minX >= a.maxX - 0.001 ||
    a.minY >= b.maxY - 0.001 ||
    b.minY >= a.maxY - 0.001
  ) {
    return false;
  }
  return !separates(a, b) && !separates(b, a);
}
// a's polygon clipped to b's, on screen.
function intersection(a: Plate, b: Plate): readonly Vertex[] {
  let points: readonly Vertex[] = a.fragment.polygon;
  const polygon = b.fragment.polygon;
  for (let i = 0; i < polygon.length && points.length; i++) {
    const p = polygon[i]!,
      q = polygon[(i + 1) % polygon.length]!;
    const distance = (v: Vertex) =>
      b.winding * ((q.x - p.x) * (v.y - p.y) - (q.y - p.y) * (v.x - p.x));
    const next: Vertex[] = [];
    for (let j = 0; j < points.length; j++) {
      const u = points[j]!,
        v = points[(j + 1) % points.length]!,
        du = distance(u),
        dv = distance(v);
      if (du >= -1e-8) {
        next.push(u);
      }
      if ((du > 0 && dv < 0) || (du < 0 && dv > 0)) {
        const t = du / (du - dv);
        next.push({ x: u.x + t * (v.x - u.x), y: u.y + t * (v.y - u.y) });
      }
    }
    points = next;
  }
  return points;
}
function depthAt(plate: Plate, p: Vertex): number {
  if (plate.corners === null) {
    return plate.fragment.depth;
  }
  const [a, b, c] = plate.corners,
    denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y),
    u = ((b.y - c.y) * (p.x - c.x) + (c.x - b.x) * (p.y - c.y)) / denominator,
    v = ((c.y - a.y) * (p.x - c.x) + (a.x - c.x) * (p.y - c.y)) / denominator;
  return u * a.z + v * b.z + (1 - u - v) * c.z;
}
// Both depths are affine over the convex screen overlap, so its vertices bound a − b.
function depthRange(a: Plate, b: Plate) {
  let min = Infinity,
    max = -Infinity;
  for (const p of intersection(a, b)) {
    const difference = depthAt(a, p) - depthAt(b, p);
    min = Math.min(min, difference);
    max = Math.max(max, difference);
  }
  return [min, max] as const;
}
function overlapRelation(
  min: number,
  max: number,
): 'before' | 'after' | 'cross' | 'coplanar' {
  if (min < -1e-4 && max > 1e-4) {
    return 'cross';
  }
  if (max > 1e-4) {
    return 'after';
  }
  if (min < -1e-4) {
    return 'before';
  }
  return 'coplanar';
}
// Where a lies relative to b's plane as seen from the eye, allowing `epsilon` of contact.
function planeSide(
  a: Plate,
  b: Plate,
  epsilon: number,
): 'behind' | 'front' | 'unclear' {
  const origin = b.fragment.world[0]!,
    normal = b.fragment.normal;
  let min = Infinity,
    max = -Infinity;
  for (const p of a.fragment.world) {
    const distance = b.side * dot(sub(p, origin), normal);
    min = Math.min(min, distance);
    max = Math.max(max, distance);
  }
  if (max <= epsilon && min < -epsilon) {
    return 'behind';
  }
  if (min >= -epsilon && max > epsilon) {
    return 'front';
  }
  return 'unclear';
}
function hasArea(points: readonly Point3[]) {
  return (
    Math.abs(
      points.reduce((area, p, i) => {
        const q = points[(i + 1) % points.length]!;
        return area + p[0] * q[1] - q[0] * p[1];
      }, 0),
    ) > 1e-7
  );
}
function fragment(
  face: FaceFragment,
  local: readonly Point3[],
  id: number,
): FaceFragment {
  const polygon = local.map((p) => transformPoint(face.matrix, p));
  // Perspective division is reversible here because every fragment shares the original plane.
  const world = local.map((p) => {
    const q = transformPoint(face.worldMatrix, p);
    return [q.x, q.y, q.z] as const;
  });
  return {
    ...face,
    localPolygon: local,
    polygon,
    world,
    depth: world.reduce((sum, p) => sum + p[2], 0) / world.length,
    fragment: id,
  };
}
export function splitFace(
  face: FaceFragment,
  plane: FaceFragment,
  epsilon: number,
): readonly FaceFragment[] {
  const origin = plane.world[0]!,
    normal = plane.normal;
  const distances = face.world.map((p) => dot(sub(p, origin), normal));
  if (Math.min(...distances) >= -epsilon || Math.max(...distances) <= epsilon) {
    return [face];
  }
  const positive: Point3[] = [],
    negative: Point3[] = [];
  for (let i = 0; i < face.world.length; i++) {
    const p = face.world[i]!,
      q = face.world[(i + 1) % face.world.length]!;
    const local = face.localPolygon[i]!,
      next = face.localPolygon[(i + 1) % face.world.length]!;
    const dp = dot(sub(p, origin), normal),
      dq = dot(sub(q, origin), normal);
    if (dp >= -epsilon) {
      positive.push(local);
    }
    if (dp <= epsilon) {
      negative.push(local);
    }
    if ((dp > epsilon && dq < -epsilon) || (dp < -epsilon && dq > epsilon)) {
      const t = dp / (dp - dq),
        cross: Point3 = [
          local[0] + t * (next[0] - local[0]),
          local[1] + t * (next[1] - local[1]),
          0,
        ];
      positive.push(cross);
      negative.push(cross);
    }
  }
  if (!hasArea(positive) || !hasArea(negative)) {
    return [face];
  }
  return [
    fragment(face, positive, face.fragment * 2 + 1),
    fragment(face, negative, face.fragment * 2 + 2),
  ];
}
// Faces of the strongly connected components that no other remaining face must precede.
function sourceComponents(
  remaining: ReadonlySet<number>,
  successors: readonly ReadonlySet<number>[],
): number[] {
  const next = (face: number) =>
    [...successors[face]!].filter((after) => remaining.has(after));
  const order = new Map<number, number>(),
    low = new Map<number, number>(),
    component = new Map<number, number>(),
    stack: number[] = [];
  const visit = (face: number) => {
    const position = order.size;
    order.set(face, position);
    low.set(face, position);
    stack.push(face);
    for (const after of next(face)) {
      if (!order.has(after)) {
        visit(after);
        low.set(face, Math.min(low.get(face)!, low.get(after)!));
      } else if (!component.has(after)) {
        low.set(face, Math.min(low.get(face)!, order.get(after)!));
      }
    }
    if (low.get(face) === position) {
      let member: number;
      do {
        member = stack.pop()!;
        component.set(member, position);
      } while (member !== face);
    }
  };
  for (const face of remaining) {
    if (!order.has(face)) {
      visit(face);
    }
  }
  const entered = new Set<number>();
  for (const face of remaining) {
    for (const after of next(face)) {
      if (component.get(after) !== component.get(face)) {
        entered.add(component.get(after)!);
      }
    }
  }
  return [...remaining].filter((face) => !entered.has(component.get(face)!));
}
// No painter's order satisfies a cycle of constraints. Open the cycle at the faces whose
// broken constraints misplace the least screen depth; constraints off the cycle still hold.
function cheapestRelease(
  remaining: ReadonlySet<number>,
  successors: readonly ReadonlySet<number>[],
  predecessors: readonly ReadonlyMap<number, number>[],
): number[] {
  const cycle = sourceComponents(remaining, successors);
  const price = (face: number) =>
    Math.max(
      ...[...predecessors[face]!]
        .filter(([before]) => remaining.has(before))
        .map(([, cost]) => cost),
    );
  const cheapest = Math.min(...cycle.map(price));
  return cycle.filter((face) => price(face) === cheapest);
}
/**
 * Painter's order of faces `0..priority.length - 1`. Every constraint's `before` paints
 * first; among unconstrained faces the lowest priority, then the lowest position, wins.
 */
export function paintOrder(
  priority: readonly number[],
  constraints: readonly PaintConstraint[],
): number[] {
  const successors = priority.map(() => new Set<number>()),
    predecessors = priority.map(() => new Map<number, number>());
  for (const { before, after, cost } of constraints) {
    successors[before]!.add(after);
    predecessors[after]!.set(before, cost);
  }
  const remaining = new Set(priority.keys()),
    incoming = predecessors.map((before) => before.size),
    order: number[] = [];
  while (remaining.size) {
    let candidates = [...remaining].filter((face) => incoming[face] === 0);
    if (!candidates.length) {
      candidates = cheapestRelease(remaining, successors, predecessors);
    }
    const first = candidates.reduce((best, face) =>
      priority[face]! < priority[best]! ? face : best,
    );
    remaining.delete(first);
    order.push(first);
    for (const after of successors[first]!) {
      incoming[after]! -= 1;
    }
  }
  return order;
}
/** What an overlapping pair, in scene order, says about how to paint it. */
interface Verdict {
  readonly earlier: Plate;
  readonly later: Plate;
  /** The extent and plane tests' order, kept when the depths leave it open. */
  readonly guess: 'earlier' | 'later' | null;
  /** Range of depth(earlier) − depth(later) over the screen overlap. */
  readonly min: number;
  readonly max: number;
  readonly precise: 'before' | 'after' | 'cross' | 'coplanar';
  /** A crossing that splitting one face along the other's plane resolves. */
  readonly cut: boolean;
  /** The face that split divides: `earlier`, unless only `later` is a line. */
  readonly divides: 'earlier' | 'later';
  /** Its pieces, when both keep some area. */
  readonly pieces: readonly FaceFragment[] | null;
}
function judge(a: Plate, b: Plate, epsilon: number): Verdict | null {
  if (!overlaps(a, b)) {
    return null;
  }
  let guess: Verdict['guess'] = null;
  if (a.maxZ < b.minZ) {
    guess = 'earlier';
  } else if (b.maxZ < a.minZ) {
    guess = 'later';
  } else {
    const ab = planeSide(a, b, epsilon),
      ba = planeSide(b, a, epsilon);
    if (ab === 'behind' || ba === 'front') {
      guess = 'earlier';
    } else if (ba === 'behind' || ab === 'front') {
      guess = 'later';
    } else if (a.fragment.face.group === b.fragment.face.group) {
      guess = a.fragment.depth <= b.fragment.depth ? 'earlier' : 'later';
    }
  }
  const [min, max] = depthRange(a, b);
  const precise = overlapRelation(min, max);
  const cut =
    precise === 'cross' &&
    a.fragment.face.group !== b.fragment.face.group &&
    a.divisible &&
    b.divisible;
  // A line is cut where it crosses a face; a face is never cut along a line.
  const divides = b.thin && !a.thin ? 'later' : 'earlier',
    [face, plane] = divides === 'earlier' ? [a, b] : [b, a];
  const pieces = cut ? splitFace(face.fragment, plane.fragment, 1e-7) : [];
  return {
    earlier: a,
    later: b,
    guess,
    min,
    max,
    precise,
    cut,
    divides,
    pieces: pieces.length > 1 ? pieces : null,
  };
}
// The face a verdict paints first once nothing is left to split.
function paintsFirst(verdict: Verdict): Verdict['guess'] {
  if (verdict.cut) {
    // A crossing too thin to split leaves the pair to depth priority.
    return null;
  }
  if (verdict.precise === 'before') {
    return 'earlier';
  }
  if (verdict.precise === 'after') {
    return 'later';
  }
  return verdict.guess;
}
export function sortDepth(
  projected: readonly ProjectedFace[],
  unit: number,
  eye: Point3,
): readonly FaceFragment[] {
  const epsilon = 0.05 * unit;
  const faces: FaceFragment[] = projected
    .filter((face) => Number(face.face.op.toFixed(3)) > 0)
    .map((face) => ({
      ...face,
      fragment: 0,
      localPolygon: face.localPolygon,
    }));
  const floor = faces
    .filter((f) => f.face.layer === 'floor')
    .sort((a, b) => a.depth - b.depth || a.index - b.index);
  const solids = faces
    .filter((f) => f.face.layer === 'solid')
    .map((f) => prepare(f, eye));
  // A split only changes the pairs of its two pieces, so every other verdict carries over.
  const verdicts = new Set<Verdict>(),
    splits = new Set<Verdict>(),
    involving = new Map(solids.map((plate) => [plate, [] as Verdict[]]));
  const record = (verdict: Verdict | null) => {
    if (verdict === null) {
      return;
    }
    verdicts.add(verdict);
    involving.get(verdict.earlier)!.push(verdict);
    involving.get(verdict.later)!.push(verdict);
    if (verdict.pieces !== null) {
      splits.add(verdict);
    }
  };
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      record(judge(solids[i]!, solids[j]!, epsilon));
    }
  }
  for (let pass = 0; pass < 128; pass++) {
    const position = new Map(solids.map((plate, k) => [plate, k]));
    const at = (plate: Plate) => position.get(plate)!;
    const inScene = (v: Verdict, w: Verdict) =>
      at(v.earlier) - at(w.earlier) || at(v.later) - at(w.later);
    // Pairs are visited in scene order, and the first that needs it is split.
    const [split] = [...splits].sort(inScene);
    if (split === undefined) {
      const constraints: PaintConstraint[] = [];
      for (const verdict of [...verdicts].sort(inScene)) {
        const i = at(verdict.earlier),
          j = at(verdict.later),
          first = paintsFirst(verdict);
        if (first === 'earlier') {
          constraints.push({ before: i, after: j, cost: -verdict.min });
        } else if (first === 'later') {
          constraints.push({ before: j, after: i, cost: verdict.max });
        }
      }
      const order = paintOrder(
        solids.map((plate) => plate.fragment.depth),
        constraints,
      );
      return [...floor, ...order.map((k) => solids[k]!.fragment)];
    }
    const divided = split.divides === 'earlier' ? split.earlier : split.later,
      index = at(divided),
      pieces = split.pieces!.map((piece) => prepare(piece, eye));
    for (const verdict of involving.get(divided)!) {
      verdicts.delete(verdict);
      splits.delete(verdict);
    }
    involving.delete(divided);
    solids.splice(index, 1, ...pieces);
    for (const piece of pieces) {
      involving.set(piece, []);
    }
    // The pieces take the split face's place in scene order.
    solids.forEach((other, k) => {
      if (k < index) {
        pieces.forEach((piece) => record(judge(other, piece, epsilon)));
      } else if (k >= index + pieces.length) {
        pieces.forEach((piece) => record(judge(piece, other, epsilon)));
      }
    });
    record(judge(pieces[0]!, pieces[1]!, epsilon));
  }
  throw new Error('Scene depth splitting did not converge');
}
