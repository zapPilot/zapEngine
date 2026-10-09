import type {
  DrawColor,
  DrawCommand,
  DrawRole,
  DrawShape,
  DrawStop,
  Matrix3,
  Point2,
  Rect,
} from './draw-types.js';
import type { Border, Length, SceneColor, SceneFace } from './scene.js';
export function unknownVariant(value: never): never {
  throw new Error(`Unknown draw variant: ${JSON.stringify(value)}`);
}
export const round = (value: number, digits: number) =>
  Number(value.toFixed(digits));
function length(value: Length, unit: number): number {
  switch (value.k) {
    case 'px':
    case 'bare':
      return value.n;
    case 'world':
      return round(value.n, 4) * unit;
    default:
      return unknownVariant(value);
  }
}
/** CSS box shorthand: top, right, bottom, left (corners run clockwise from top-left). */
export function sides(values: readonly Length[], unit: number) {
  const [a = 0, b = a, c = a, d = b] = values.map((v) => length(v, unit));
  return [a, b, c, d] as const;
}
function borderWidth(border: Border, unit: number): number {
  switch (border.style) {
    case 'none':
      return 0;
    case 'solid':
    case 'dashed':
      return length(border.width, unit);
    default:
      return unknownVariant(border.style);
  }
}
/**
 * The pixel box a face draws in. A border box never shrinks below its borders and
 * padding, so a line (a 0-height face) is as tall as its two borders.
 */
export function borderBox(face: SceneFace, unit: number) {
  const edge = borderWidth(face.border, unit);
  const [pt, pr, pb, pl] = sides(face.text.padding, unit);
  return {
    edge,
    padding: [pt, pr, pb, pl] as const,
    w: Math.max(round(face.w, 4) * unit, 2 * edge + pl + pr),
    h: Math.max(round(face.h, 4) * unit, 2 * edge + pt + pb),
  };
}
export const role = (id: DrawRole): DrawColor => ({ k: 'token', id });
export const CLEAR: DrawColor = { k: 'transparent' };
export const OPAQUE: DrawColor = { k: 'shade', alpha: 1 };
export const fade = (color: DrawColor, pct: number): DrawColor => ({
  k: 'mix',
  a: color,
  pct,
  b: CLEAR,
});
export const stop = (offset: number, color: DrawColor): DrawStop => ({
  offset,
  color,
});
/** Resolves a scene colour, rounding `color-mix` percentages exactly as the CSS serializer does. */
export function drawColor(color: SceneColor): DrawColor {
  switch (color.k) {
    case 'token':
    case 'transparent':
      return color;
    case 'mix':
      return {
        k: 'mix',
        a: drawColor(color.a),
        pct: color.digits === null ? color.pct : round(color.pct, color.digits),
        b: drawColor(color.b),
      };
    default:
      return unknownVariant(color);
  }
}
export const rect = (x: number, y: number, w: number, h: number): Rect => ({
  x,
  y,
  w,
  h,
});
const SQUARE: readonly Point2[] = [
  [0, 0],
  [0, 0],
  [0, 0],
  [0, 0],
];
export interface RoundRect {
  readonly rect: Rect;
  readonly radii: readonly Point2[];
}
export const roundRect = (
  area: Rect,
  radii: readonly Point2[] = SQUARE,
): RoundRect => ({ rect: area, radii });
export const shape = (area: RoundRect): DrawShape => ({
  k: 'rect',
  rect: area.rect,
  radii: area.radii,
});
/** CSS corner-overlap rule: radii shrink together until adjacent corners fit their side. */
export function fitRadii(
  radii: readonly Point2[],
  w: number,
  h: number,
): readonly Point2[] {
  const [tl, tr, br, bl] = radii as readonly [Point2, Point2, Point2, Point2];
  const ratio = (side: number, a: number, b: number) =>
    a + b > side ? side / (a + b) : 1;
  const scale = Math.min(
    ratio(w, tl[0], tr[0]),
    ratio(w, bl[0], br[0]),
    ratio(h, tl[1], bl[1]),
    ratio(h, tr[1], br[1]),
  );
  return radii.map(([x, y]) => [x * scale, y * scale] as const);
}
/** Moves every edge inward by `d` (outward when negative), keeping corners concentric. */
export function inset(area: RoundRect, d: number): RoundRect {
  const { x, y, w, h } = area.rect;
  return {
    rect: rect(x + d, y + d, Math.max(0, w - 2 * d), Math.max(0, h - 2 * d)),
    radii: area.radii.map(
      ([rx, ry]) =>
        [
          rx > 0 ? Math.max(0, rx - d) : 0,
          ry > 0 ? Math.max(0, ry - d) : 0,
        ] as const,
    ),
  };
}
export const shift = (area: RoundRect, dx: number, dy: number): RoundRect => ({
  rect: rect(area.rect.x + dx, area.rect.y + dy, area.rect.w, area.rect.h),
  radii: area.radii,
});
export const polygon = (points: readonly Point2[]): DrawShape => ({
  k: 'polygon',
  points,
});
export const translate = (x: number, y: number, scale: number): Matrix3 => [
  scale,
  0,
  x,
  0,
  scale,
  y,
  0,
  0,
  1,
];
const isRounded = (area: RoundRect) =>
  area.radii.some(([rx, ry]) => rx > 0 || ry > 0);
// Chromium sizes dashes from the whole-pixel width (measured: 1, 1.5 and 1.68px all
// dash 3px/2px; 2px dashes 6/4): under 3px three on, two off; from 3px two on, one off.
function dashPattern(width: number): readonly [number, number] {
  const whole = Math.max(1, Math.floor(width));
  return whole >= 3 ? [2 * whole, whole] : [3 * whole, 2 * whole];
}
/** Blink's gap selection: whole dashes at both ends of an open side, evenly spaced around a closed one. */
function dashGap(
  length: number,
  dash: number,
  gap: number,
  closed: boolean,
): number {
  const fewer = Math.floor((length + gap) / (dash + gap));
  const more = fewer + 1;
  const fewerGap = (length - fewer * dash) / (closed ? fewer : fewer - 1);
  const moreGap = (length - more * dash) / (closed ? more : more - 1);
  return moreGap <= 0 || Math.abs(fewerGap - gap) < Math.abs(moreGap - gap)
    ? fewerGap
    : moreGap;
}
// Each rounded corner trades two straight half-sides for a quarter arc.
function perimeter(area: RoundRect) {
  const corners = area.radii.reduce(
    (sum, [rx, ry]) => sum + (Math.PI / 4 - 1) * (rx + ry),
    0,
  );
  return 2 * (area.rect.w + area.rect.h) + corners;
}
/**
 * A dashed CSS border of `width` inside `outer`. Square boxes dash each side between
 * mitred corners; rounded boxes dash their centreline as one closed contour.
 */
export function dashedBorder(
  outer: RoundRect,
  width: number,
  color: DrawColor,
  alpha: number,
): DrawCommand[] {
  const [dash, gap] = dashPattern(width);
  const centre = inset(outer, width / 2);
  if (isRounded(outer)) {
    const length = perimeter(centre);
    return [
      {
        op: 'stroke',
        shape: shape(centre),
        width,
        dash:
          length <= 2 * dash ? null : [dash, dashGap(length, dash, gap, true)],
        color,
        alpha,
      },
    ];
  }
  const { x, y, w, h } = outer.rect;
  const [l, t, r, b] = [x, y, x + w, y + h];
  const m = width / 2,
    d = width;
  const sides: readonly (readonly [Point2[], Point2[]])[] = [
    [
      [
        [l, t + m],
        [r, t + m],
      ],
      [
        [l, t],
        [r, t],
        [r - d, t + d],
        [l + d, t + d],
      ],
    ],
    [
      [
        [r - m, t],
        [r - m, b],
      ],
      [
        [r, t],
        [r, b],
        [r - d, b - d],
        [r - d, t + d],
      ],
    ],
    [
      [
        [l, b - m],
        [r, b - m],
      ],
      [
        [l, b],
        [r, b],
        [r - d, b - d],
        [l + d, b - d],
      ],
    ],
    [
      [
        [l + m, t],
        [l + m, b],
      ],
      [
        [l, t],
        [l, b],
        [l + d, b - d],
        [l + d, t + d],
      ],
    ],
  ];
  return sides.flatMap(([line, mitre]) => {
    const length = Math.hypot(
      line[1]![0] - line[0]![0],
      line[1]![1] - line[0]![1],
    );
    return [
      { op: 'save' },
      { op: 'clip', shape: polygon(mitre) },
      {
        op: 'stroke',
        shape: { k: 'line', points: line },
        width,
        dash:
          length <= 2 * dash ? null : [dash, dashGap(length, dash, gap, false)],
        color,
        alpha,
      },
      { op: 'restore' },
    ] satisfies DrawCommand[];
  });
}
/** Fills the region of `outer` outside `inner`: solid borders, spread rings and inset shading. */
export const ring = (
  outer: RoundRect,
  inner: RoundRect,
  color: DrawColor,
  alpha: number,
): DrawCommand => ({
  op: 'fill',
  shape: { k: 'difference', outer: shape(outer), inner: shape(inner) },
  paint: { k: 'color', color },
  alpha,
  blend: 'srcOver',
});
interface MarkStroke {
  readonly d: string;
  readonly style: 'fill' | 'stroke';
}
const strokes = (d: string): readonly MarkStroke[] => [{ d, style: 'stroke' }];
/**
 * Rule and gate marks missing from the bundled Martian Mono subset, drawn on a
 * 24-unit em square. Platform fallbacks substitute emoji or tofu for these.
 */
export const RULE_MARKS: ReadonlyMap<string, readonly MarkStroke[]> = new Map([
  ['↘', strokes('M5 5L18 18M18 9V18H9')],
  ['↗', strokes('M5 19L18 6M9 6H18V15')],
  ['⇄', strokes('M4 8H20M16 4L20 8L16 12M20 16H4M8 12L4 16L8 20')],
  [
    '∶',
    [
      {
        d: 'M10.3 8a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0M10.3 16a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0',
        style: 'fill',
      },
    ],
  ],
  ['◇', strokes('M12 4L19.5 12L12 20L4.5 12Z')],
  ['⊥', strokes('M12 5V19M5 19H19')],
  ['✓', strokes('M5 12.5L10 17.5L19.5 6.5')],
]);
const MARK_STROKE = 2;
/** Draws a mark from {@link RULE_MARKS} on an em square of `size` at (x, y). */
export function markCommands(
  mark: readonly MarkStroke[],
  x: number,
  y: number,
  size: number,
  color: DrawColor,
  alpha: number,
): DrawCommand[] {
  return [
    { op: 'save' },
    { op: 'concat', matrix: translate(x, y, size / 24) },
    ...mark.map(
      (part): DrawCommand => ({
        op: 'path',
        d: part.d,
        style: part.style,
        width: MARK_STROKE,
        cap: 'round',
        color,
        alpha,
      }),
    ),
    { op: 'restore' },
  ];
}
/** An asset mark scaled into `area` like an SVG with a 24-unit viewBox. */
export function glyphCommands(
  d: string,
  area: Rect,
  color: DrawColor,
  alpha: number,
): DrawCommand[] {
  const scale = Math.min(area.w, area.h) / 24;
  return [
    { op: 'save' },
    {
      op: 'concat',
      matrix: translate(
        area.x + (area.w - 24 * scale) / 2,
        area.y + (area.h - 24 * scale) / 2,
        scale,
      ),
    },
    { op: 'path', d, style: 'stroke', width: 1.6, cap: 'round', color, alpha },
    { op: 'restore' },
  ];
}
