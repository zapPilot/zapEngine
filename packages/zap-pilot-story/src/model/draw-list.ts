import { ASSET_GLYPH_PATHS } from './asset-glyphs.js';
import { sortDepth } from './depth.js';
import {
  dialCommands,
  pinBillboard,
  tagBillboard,
  type Billboard,
} from './draw-billboards.js';
import {
  CLEAR,
  OPAQUE,
  RULE_MARKS,
  borderBox,
  dashedBorder,
  drawColor,
  fade,
  fitRadii,
  glyphCommands,
  inset,
  markCommands,
  polygon,
  rect,
  ring,
  role,
  round,
  roundRect,
  shape,
  shift,
  sides,
  stop,
  unknownVariant,
  type RoundRect,
} from './draw-primitives.js';
import type {
  DrawColor,
  DrawCommand,
  DrawFont,
  DrawList,
  DrawPaint,
  DrawShape,
  DrawStop,
  EngineLayer,
  Point2,
  Rect,
  TextMeasure,
} from './draw-types.js';
import {
  cameraMatrix,
  homography,
  multiply4,
  perspectiveMatrix,
  projectBillboard,
  projectFace,
  transformPoint,
  translation4,
  type Point3,
  type ProjectedFace,
  type ProjectionLayout,
} from './projection.js';
import {
  token,
  transparent,
  type Clip,
  type EngineFrame,
  type Fill,
  type Mask,
  type Radius,
  type SceneDot,
  type SceneFace,
  type Shadow,
} from './scene.js';
export type * from './draw-types.js';
export interface DrawListOptions {
  readonly layout: ProjectionLayout;
  readonly measure: TextMeasure;
  /**
   * Host copy keyed by pin id, as in `EngineWorld`: a labelled text pin shows only its
   * label; unmatched pins keep the scene title and subtitle.
   */
  readonly pinLabels?: Readonly<Record<string, string>>;
  readonly layers?: readonly EngineLayer[];
}
/** One drawing step at a given opacity. */
type Part = (alpha: number) => DrawCommand[];
function radii(radius: Radius, w: number, h: number, unit: number) {
  switch (radius.k) {
    case 'corners':
      return sides(radius.values, unit).map((r): Point2 => [r, r]);
    case 'percent': {
      const r: Point2 = [(w * radius.n) / 100, (h * radius.n) / 100];
      return [r, r, r, r];
    }
    default:
      return unknownVariant(radius);
  }
}
/** A repeating 1px rule every `to` along its axis, as a hard-stop gradient. */
function hairlines(to: Point2, color: DrawColor): DrawPaint {
  const edge = Math.min(1, 1 / Math.hypot(to[0], to[1]));
  return {
    k: 'linear',
    from: [0, 0],
    to,
    stops: [
      stop(0, color),
      stop(edge, color),
      stop(edge, CLEAR),
      stop(1, CLEAR),
    ],
    repeat: true,
  };
}
/** `radial-gradient(closest-side, …)`: the ellipse touching all four sides of the box. */
const closestSide = (
  w: number,
  h: number,
  stops: readonly DrawStop[],
): DrawPaint => ({
  k: 'radial',
  center: [w / 2, h / 2],
  radius: [w / 2, h / 2],
  stops,
});
function fillPaint(
  fill: Fill,
  w: number,
  h: number,
  unit: number,
): DrawPaint | null {
  switch (fill.k) {
    case 'token':
    case 'mix':
      return { k: 'color', color: drawColor(fill) };
    case 'transparent':
      return null;
    case 'linear135':
      return {
        k: 'linear',
        from: [(w - h) / 4, (h - w) / 4],
        to: [(3 * w + h) / 4, (3 * h + w) / 4],
        stops: [stop(0, drawColor(fill.a)), stop(1, drawColor(fill.b))],
        repeat: false,
      };
    case 'radialShadow':
      return closestSide(w, h, [
        stop(0, role('material-shadow')),
        stop(1, CLEAR),
      ]);
    case 'stripes':
      return {
        k: 'blend',
        mode: 'srcOver',
        dst: { k: 'color', color: drawColor(fill.base) },
        src: hairlines([0, fill.step * unit], role('material-edge')),
      };
    case 'grid': {
      const step = round(fill.step, 4) * unit;
      // The horizontal rules are the top CSS background layer.
      return {
        k: 'blend',
        mode: 'srcOver',
        dst: hairlines([step, 0], role('material-floor')),
        src: hairlines([0, step], role('material-floor')),
      };
    }
    default:
      return unknownVariant(fill);
  }
}
function maskPaint(mask: Mask, w: number, h: number): DrawPaint | null {
  switch (mask.k) {
    case 'none':
      return null;
    case 'floor':
      return closestSide(w, h, [
        stop(0, OPAQUE),
        stop(0.35, OPAQUE),
        stop(1, CLEAR),
      ]);
    case 'signWash':
      return {
        k: 'radial',
        center: [w / 2, 0],
        radius: [w / 2, h],
        stops: [stop(0, OPAQUE), stop(0.45, OPAQUE), stop(1, CLEAR)],
      };
    case 'signStrip':
      return {
        k: 'linear',
        from: [0, 0],
        to: [w, 0],
        stops: [
          stop(0, CLEAR),
          stop(0.25, OPAQUE),
          stop(0.75, OPAQUE),
          stop(1, CLEAR),
        ],
        repeat: false,
      };
    default:
      return unknownVariant(mask);
  }
}
function clipShape(clip: Clip, w: number, h: number): DrawShape | null {
  switch (clip.k) {
    case 'none':
      return null;
    case 'triangle':
      return polygon([
        [0, 0],
        [w, 0],
        [w / 2, h],
      ]);
    case 'hexagon':
      return polygon([
        [w, 0.5 * h],
        [0.75 * w, 0.933 * h],
        [0.25 * w, 0.933 * h],
        [0, 0.5 * h],
        [0.25 * w, 0.067 * h],
        [0.75 * w, 0.067 * h],
      ]);
    case 'circle': {
      // circle(50%) resolves against the box diagonal over √2.
      const r = Math.hypot(w, h) / Math.SQRT2 / 2;
      return { k: 'ellipse', rect: rect(w / 2 - r, h / 2 - r, 2 * r, 2 * r) };
    }
    default:
      return unknownVariant(clip);
  }
}
interface Shading {
  readonly under: readonly Part[];
  readonly over: readonly Part[];
  readonly spread: number;
}
function shading(
  shadow: Shadow,
  outer: RoundRect,
  padding: RoundRect,
): Shading {
  switch (shadow.k) {
    case 'none':
      return { under: [], over: [], spread: 0 };
    case 'insetEdge':
      return {
        under: [],
        over: [
          (a) => [ring(padding, inset(padding, 1), role('material-edge'), a)],
        ],
        spread: 0,
      };
    case 'signRing': {
      const spread = round(shadow.spread, 1);
      const halo = fade(role('sign'), round(shadow.pct, 0));
      return {
        under: [(a) => [ring(inset(outer, -spread), outer, halo, a)]],
        // inset 0 -3px 0: the padding box minus itself raised by 3px.
        over: [
          (a) => [
            ring(
              padding,
              shift(padding, 0, -3),
              { k: 'shade', alpha: 0.22 },
              a,
            ),
          ],
        ],
        spread,
      };
    }
    default:
      return unknownVariant(shadow);
  }
}
/** Content clipped to the padding box, as `overflow: hidden` does. */
function contentParts(
  face: SceneFace,
  content: Rect,
  padding: RoundRect,
  unit: number,
): Part[] {
  const text = face.text,
    color = drawColor(text.color);
  const size = round(text.size, 4) * unit;
  const font: DrawFont = {
    weight: text.weight,
    size,
    letterSpacing: 0.06 * size,
    lineHeight: 1.25,
  };
  const mark = RULE_MARKS.get(text.value);
  const pieces: Part[] = [];
  if (face.glyph !== undefined) {
    const d = ASSET_GLYPH_PATHS[face.glyph];
    pieces.push((a) => glyphCommands(d, content, color, a));
  }
  if (mark) {
    const x =
      text.align === 'center' ? content.x + (content.w - size) / 2 : content.x;
    const y = content.y + ((font.lineHeight - 1) * size) / 2;
    pieces.push((a) => markCommands(mark, x, y, size, color, a));
  } else if (text.value) {
    pieces.push((a) => [
      {
        op: 'text',
        text: text.value,
        x: content.x,
        y: content.y,
        width: content.w,
        align: text.align,
        origin: 'top',
        font,
        color,
        alpha: a,
      },
    ]);
  }
  return pieces.map((piece) => (a) => [
    { op: 'save' },
    { op: 'clip', shape: shape(padding) },
    ...piece(a),
    { op: 'restore' },
  ]);
}
/** A `.zp-fc` element drawn in its own border-box pixels. */
function faceCommands(face: SceneFace, unit: number): DrawCommand[] {
  const {
    edge,
    padding: [pt, pr, pb, pl],
    w,
    h,
  } = borderBox(face, unit);
  const outer = roundRect(
    rect(0, 0, w, h),
    fitRadii(radii(face.radius, w, h, unit), w, h),
  );
  const padding = inset(outer, edge);
  const content = rect(
    edge + pl,
    edge + pt,
    w - 2 * edge - pl - pr,
    h - 2 * edge - pt - pb,
  );
  const shade = shading(face.shadow, outer, padding);
  const border = drawColor(face.border.color);
  const rest: Part[] = [
    ...shade.over,
    ...(edge > 0
      ? [
          face.border.style === 'dashed'
            ? (a: number) => dashedBorder(outer, edge, border, a)
            : (a: number) => [ring(outer, padding, border, a)],
        ]
      : []),
    ...contentParts(face, content, padding, unit),
  ];
  const mask = maskPaint(face.mask, w, h);
  const fill = fillPaint(face.fill, w, h, unit);
  // A lone fill takes its mask as one DstIn shader; anything more masks a layer.
  const lone = !rest.length && !shade.under.length;
  const background: Part[] =
    fill === null
      ? []
      : [
          (a) => [
            {
              op: 'fill',
              shape: shape(outer),
              paint:
                mask !== null && lone
                  ? { k: 'blend', mode: 'dstIn', dst: fill, src: mask }
                  : fill,
              alpha: a,
              blend: 'srcOver',
            },
          ],
        ];
  const parts = [...shade.under, ...background, ...rest];
  if (!parts.length) {
    return [];
  }
  const masked = mask !== null && !lone;
  if (masked) {
    parts.push(() => [
      {
        op: 'fill',
        shape: shape(outer),
        paint: mask,
        alpha: 1,
        blend: 'dstIn',
      },
    ]);
  }
  const opacity = round(face.op, 3);
  const clip = clipShape(face.clip, w, h);
  const clipped: DrawCommand[] =
    clip === null ? [] : [{ op: 'clip', shape: clip }];
  if (masked || (opacity < 1 && parts.length > 1)) {
    return [
      ...clipped,
      {
        op: 'layer',
        alpha: opacity,
        bounds: inset(outer, -shade.spread).rect,
      },
      ...parts.flatMap((part) => part(1)),
      { op: 'restore' },
    ];
  }
  return [...clipped, ...parts.flatMap((part) => part(opacity))];
}
const NO_TEXT: SceneFace['text'] = {
  value: '',
  color: transparent,
  size: 0,
  weight: 400,
  padding: [],
  align: 'left',
};
/** Plane stand-ins let the dial and the stream dots share the faces' depth order. */
function standIn(
  group: string,
  w: number,
  h: number,
  op: number,
  fill: SceneFace['fill'],
  ops: SceneFace['ops'],
): SceneFace {
  return {
    ops,
    w,
    h,
    op,
    layer: 'solid',
    group,
    fill,
    border: { width: { k: 'px', n: 0 }, style: 'none', color: transparent },
    radius: { k: 'corners', values: [] },
    shadow: { k: 'none' },
    mask: { k: 'none' },
    clip: { k: 'none' },
    text: NO_TEXT,
    glyph: undefined,
  };
}
/** A dot is a screen-parallel disc at its camera-space anchor, centred like `translate(-50%,-50%)`. */
function projectDot(
  frame: EngineFrame,
  dot: SceneDot,
  index: number,
  layout: ProjectionLayout,
): ProjectedFace {
  const unit = layout.unit,
    size = dot.size;
  const anchor = dot.anchor.map((n) => round(n, 4) * unit);
  const centre = transformPoint(cameraMatrix(frame, unit), [
    anchor[0]!,
    anchor[1]!,
    anchor[2]!,
  ]);
  const worldMatrix = translation4(
    centre.x - size / 2,
    centre.y - size / 2,
    centre.z,
  );
  const matrix = multiply4(perspectiveMatrix(frame, layout), worldMatrix);
  const localPolygon: Point3[] = [
    [0, 0, 0],
    [size, 0, 0],
    [size, size, 0],
    [0, size, 0],
  ];
  return {
    face: standIn(
      `dot-${index}`,
      size / unit,
      size / unit,
      dot.op,
      dot.color,
      [],
    ),
    index,
    matrix,
    worldMatrix,
    homography: homography(matrix),
    polygon: localPolygon.map((p) => transformPoint(matrix, p)),
    localPolygon,
    world: localPolygon.map(
      ([x, y]): Point3 => [
        centre.x - size / 2 + x,
        centre.y - size / 2 + y,
        centre.z,
      ],
    ),
    depth: centre.z,
    normal: [0, 0, 1],
  };
}
function dotCommands(dot: SceneDot): DrawCommand[] {
  return [
    {
      op: 'fill',
      shape: { k: 'ellipse', rect: rect(0, 0, dot.size, dot.size) },
      paint: { k: 'color', color: drawColor(dot.color) },
      alpha: round(dot.op, 3),
      blend: 'srcOver',
    },
  ];
}
function placeBillboard(
  board: Billboard,
  at: { x: number; y: number; scale: number },
  opacity: number,
): DrawCommand[] {
  const k = at.scale;
  const body: DrawCommand[] =
    opacity < 1
      ? [
          {
            op: 'layer',
            alpha: opacity,
            bounds: rect(0, 0, board.width, board.height),
          },
          ...board.commands,
          { op: 'restore' },
        ]
      : [...board.commands];
  return [
    { op: 'save' },
    {
      op: 'concat',
      matrix: [
        k,
        0,
        at.x - k * board.anchor[0],
        0,
        k,
        at.y - k * board.anchor[1],
        0,
        0,
        1,
      ],
    },
    ...body,
    { op: 'restore' },
  ];
}
const ALL_LAYERS: readonly EngineLayer[] = [
  'faces',
  'dial',
  'dots',
  'tags',
  'pins',
];
/**
 * Converts one engine frame into painter's-order drawing commands for `layout`. Faces,
 * the dial and stream dots share the scene's depth order (split faces clip to their
 * fragment); tags and pins draw above them, farthest first, like the DOM's two layers.
 */
export function buildDrawList(
  frame: EngineFrame,
  options: DrawListOptions,
): DrawList {
  const { layout, measure, pinLabels = {}, layers = ALL_LAYERS } = options;
  const unit = layout.unit;
  const dialIndex = frame.faces.length;
  const planes = [
    ...(layers.includes('faces')
      ? frame.faces.map((face, index) =>
          projectFace(frame, face, index, layout),
        )
      : []),
    ...(layers.includes('dial')
      ? [
          projectFace(
            frame,
            standIn(
              'dial',
              frame.dial.w,
              frame.dial.h,
              1,
              token('ground'),
              frame.dial.ops,
            ),
            dialIndex,
            layout,
          ),
        ]
      : []),
    ...(layers.includes('dots')
      ? frame.dots.map((dot, i) =>
          projectDot(frame, dot, dialIndex + 1 + i, layout),
        )
      : []),
  ];
  const origin = layout.origin ?? frame.origin,
    pivot = layout.perspectiveOrigin ?? frame.perspectiveOrigin;
  const eye: Point3 = [
    (pivot[0] - origin[0]) * layout.width,
    (pivot[1] - origin[1]) * layout.height,
    frame.perspective * unit,
  ];
  const commands: DrawCommand[] = [];
  for (const piece of sortDepth(planes, unit, eye)) {
    const body =
      piece.index < dialIndex
        ? faceCommands(piece.face, unit)
        : piece.index === dialIndex
          ? dialCommands(frame.dial, unit)
          : dotCommands(frame.dots[piece.index - dialIndex - 1]!);
    if (!body.length) {
      continue;
    }
    commands.push(
      { op: 'save' },
      { op: 'concat', matrix: piece.homography },
      ...(piece.fragment === 0
        ? []
        : [
            {
              op: 'clip',
              shape: polygon(
                piece.localPolygon.map(([x, y]): Point2 => [x, y]),
              ),
            } as const,
          ]),
      ...body,
      { op: 'restore' },
    );
  }
  const boards = [
    ...(layers.includes('tags')
      ? frame.tags.map((tag) => ({
          board: tagBillboard(tag, unit, measure),
          anchor: tag.anchor,
          op: tag.op,
        }))
      : []),
    ...(layers.includes('pins')
      ? frame.pins.map((pin) => ({
          board: pinBillboard(
            pin,
            pin.asset === undefined && Object.hasOwn(pinLabels, pin.id)
              ? pinLabels[pin.id]
              : undefined,
            unit,
            measure,
          ),
          anchor: pin.anchor,
          op: pin.op,
        }))
      : []),
  ]
    .map((board) => ({
      ...board,
      at: projectBillboard(frame, board.anchor, layout),
    }))
    .sort((a, b) => a.at.scale - b.at.scale);
  for (const { board, at, op } of boards) {
    commands.push(...placeBillboard(board, at, round(op, 3)));
  }
  return { width: layout.width, height: layout.height, commands };
}
