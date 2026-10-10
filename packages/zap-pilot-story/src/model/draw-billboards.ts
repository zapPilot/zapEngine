import { ASSET_GLYPH_PATHS } from './asset-glyphs.js';
import {
  RULE_MARKS,
  dashedBorder,
  fade,
  glyphCommands,
  inset,
  markCommands,
  rect,
  ring,
  role,
  round,
  roundRect,
  shape,
  translate,
  unknownVariant,
} from './draw-primitives.js';
import type {
  DrawColor,
  DrawCommand,
  DrawFont,
  Matrix3,
  Point2,
  TextMeasure,
} from './draw-types.js';
import type { EngineFrame, PinTone, ScenePin, SceneTag } from './scene.js';
/** A screen-facing label drawn in its own pixels; `anchor` lands on the projected point. */
export interface Billboard {
  readonly width: number;
  readonly height: number;
  readonly anchor: Point2;
  readonly commands: readonly DrawCommand[];
}
/** Billboard type: clamp(10px, 0.95U, 15px). */
const billboardSize = (unit: number) => Math.min(15, Math.max(10, 0.95 * unit));
interface Chip {
  readonly w: number;
  readonly h: number;
  readonly draw: (x: number, y: number) => DrawCommand[];
}
function textChip(
  text: string,
  font: DrawFont,
  color: DrawColor,
  alpha: number,
  measure: TextMeasure,
): Chip {
  const line = font.size * font.lineHeight;
  const mark = RULE_MARKS.get(text);
  if (mark) {
    return {
      w: font.size + font.letterSpacing,
      h: line,
      draw: (x, y) =>
        markCommands(
          mark,
          x,
          y + (line - font.size) / 2,
          font.size,
          color,
          alpha,
        ),
    };
  }
  const w = measure(text, font);
  return {
    w,
    h: line,
    // Labels never wrap; the spare pixel keeps rounding from breaking the last glyph.
    draw: (x, y) => [
      {
        op: 'text',
        text,
        x,
        y,
        width: w + 1,
        align: 'left',
        origin: 'top',
        font,
        color,
        alpha,
      },
    ],
  };
}
const GLYPH_SIZE = 18;
const glyphChip = (d: string, color: DrawColor): Chip => ({
  w: GLYPH_SIZE,
  h: GLYPH_SIZE,
  draw: (x, y) =>
    glyphCommands(d, rect(x, y, GLYPH_SIZE, GLYPH_SIZE), color, 1),
});
/** Flex row with `align-items: center`. */
function row(chips: readonly Chip[], gap: number): Chip {
  const h = Math.max(...chips.map((chip) => chip.h));
  return {
    w: chips.reduce((sum, chip) => sum + chip.w, 0) + gap * (chips.length - 1),
    h,
    draw: (x, y) => {
      let cursor = x;
      return chips.flatMap((chip) => {
        const commands = chip.draw(cursor, y + (h - chip.h) / 2);
        cursor += chip.w + gap;
        return commands;
      });
    },
  };
}
interface Look {
  readonly fill: DrawColor;
  readonly ink: DrawColor;
  readonly edge: DrawColor;
  readonly dashed: boolean;
}
const INK_LOOK: Look = {
  fill: role('ink'),
  ink: role('ground'),
  edge: role('ink'),
  dashed: false,
};
function pinLook(tone: PinTone): Look {
  switch (tone) {
    case '':
      return {
        fill: role('sheet'),
        ink: role('ink'),
        edge: role('rule-2'),
        dashed: false,
      };
    case 'ink':
      return INK_LOOK;
    case 'sign':
      return {
        fill: role('sheet'),
        ink: role('sign-ink'),
        edge: role('sign'),
        dashed: false,
      };
    case 'plan':
      return {
        fill: fade(role('sheet'), 86),
        ink: role('ink-2'),
        edge: role('rule-2'),
        dashed: true,
      };
    default:
      return unknownVariant(tone);
  }
}
// Tags only style the ink tone; sign and plan tags keep the default chrome.
function tagLook(tone: PinTone): Look {
  switch (tone) {
    case 'ink':
      return INK_LOOK;
    case '':
    case 'sign':
    case 'plan':
      return {
        fill: fade(role('sheet'), 90),
        ink: role('ink-2'),
        edge: role('rule'),
        dashed: false,
      };
    default:
      return unknownVariant(tone);
  }
}
/** A 1px-bordered, 3px-rounded box around `content`, padded by `px`, `py`. */
function chrome(content: Chip, look: Look, px: number, py: number) {
  const w = content.w + 2 * (1 + px),
    h = content.h + 2 * (1 + py);
  const outer = roundRect(rect(0, 0, w, h), [
    [3, 3],
    [3, 3],
    [3, 3],
    [3, 3],
  ]);
  const commands: DrawCommand[] = [
    {
      op: 'fill',
      shape: shape(outer),
      paint: { k: 'color', color: look.fill },
      alpha: 1,
      blend: 'srcOver',
    },
    ...(look.dashed
      ? dashedBorder(outer, 1, look.edge, 1)
      : [ring(outer, inset(outer, 1), look.edge, 1)]),
    ...content.draw(1 + px, 1 + py),
  ];
  return { w, h, commands };
}
const lineRect = (
  x: number,
  y: number,
  w: number,
  h: number,
  color: DrawColor,
) =>
  ({
    op: 'fill',
    shape: shape(roundRect(rect(x, y, w, h))),
    paint: { k: 'color', color },
    alpha: 1,
    blend: 'srcOver',
  }) satisfies DrawCommand;
/**
 * `.zp-blb`: an uppercase box over a 1px stem, anchored at the stem's foot. A host
 * `label` replaces the title and drops the English subtitle; asset pins show their mark.
 */
export function pinBillboard(
  pin: ScenePin,
  label: string | undefined,
  unit: number,
  measure: TextMeasure,
): Billboard {
  const size = billboardSize(unit);
  const look = pinLook(pin.tone);
  const font = (weight: number, spacing: number): DrawFont => ({
    weight,
    size,
    letterSpacing: spacing * size,
    lineHeight: 1.3,
  });
  const chips = [
    pin.asset === undefined
      ? textChip(
          (label ?? pin.title).toUpperCase(),
          font(600, 0.06),
          look.ink,
          1,
          measure,
        )
      : glyphChip(ASSET_GLYPH_PATHS[pin.asset], look.ink),
  ];
  if (pin.subtitle && label === undefined) {
    const quiet = look === INK_LOOK ? fade(role('ground'), 72) : role('ink-3');
    chips.push(
      textChip(pin.subtitle.toUpperCase(), font(400, 0.03), quiet, 1, measure),
    );
  }
  const box = chrome(row(chips, 0.6 * size), look, 0.75 * size, 0.42 * size);
  const stem = round(pin.stem, 4) * unit;
  return {
    width: box.w,
    height: box.h + stem,
    anchor: [box.w / 2, box.h + stem],
    commands: [
      ...box.commands,
      lineRect(box.w / 2 - 0.5, box.h, 1, stem, role('ink-2')),
    ],
  };
}
const TAG_LEAD = 18;
/** `.zp-tag3d`: a numbered rule tag with an 18px lead, anchored at the lead's end. */
export function tagBillboard(
  tag: SceneTag,
  unit: number,
  measure: TextMeasure,
): Billboard {
  const size = billboardSize(unit);
  const look = tagLook(tag.tone);
  const font = (weight: number, scale: number, spacing: number): DrawFont => ({
    weight,
    size: size * scale,
    letterSpacing: spacing * size * scale,
    lineHeight: 1.3,
  });
  const chips = [
    textChip(tag.number, font(700, 1, 0.04), look.ink, 1, measure),
    textChip(tag.title, font(400, 1, 0.04), look.ink, 1, measure),
  ];
  if (tag.subtitle) {
    chips.push(
      textChip(
        tag.subtitle.toUpperCase(),
        font(400, 0.86, 0.08),
        look.ink,
        0.8,
        measure,
      ),
    );
  }
  const box = chrome(row(chips, 0.65 * size), look, 0.65 * size, 0.32 * size);
  return {
    width: box.w + TAG_LEAD,
    height: box.h,
    anchor: [box.w + TAG_LEAD, box.h / 2],
    commands: [
      ...box.commands,
      lineRect(box.w, (box.h - 1) / 2, TAG_LEAD, 1, role('ink-3')),
    ],
  };
}
const DIAL_ARC = 'M21.7 78.3A40 40 0 1 1 78.3 78.3';
const DIAL_TICKS =
  'M26.67 73.33L23.13 76.87M18.61 60.2L13.86 61.74M17.41 44.84L12.47 44.06M23.3 30.6L19.26 27.66M35.02 20.6L32.75 16.14M50 17L50 12M64.98 20.6L67.25 16.14M76.7 30.6L80.74 27.66M82.59 44.84L87.53 44.06M81.39 60.2L86.14 61.74M73.33 73.33L76.87 76.87';
const DIAL_NEEDLE = 'M50 50L50 19';
const DIAL_LABEL = 'STABLES · TARGET';
function rotation(degrees: number, cx: number, cy: number): Matrix3 {
  const angle = (degrees * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle);
  return [c, -s, cx - c * cx + s * cy, s, c, cy - s * cx - c * cy, 0, 0, 1];
}
const dialText = (text: string, y: number, font: DrawFont, color: DrawColor) =>
  ({
    op: 'text',
    text,
    x: 0,
    y,
    width: 100,
    align: 'center',
    origin: 'baseline',
    font,
    color,
    alpha: 1,
  }) satisfies DrawCommand;
/** `.zp-dial3d`: the stables gauge, its 100×90 SVG fitted into the bordered panel. */
export function dialCommands(
  dial: EngineFrame['dial'],
  unit: number,
): DrawCommand[] {
  const w = round(dial.w, 4) * unit,
    h = round(dial.h, 4) * unit;
  const outer = roundRect(rect(0, 0, w, h), [
    [6, 6],
    [6, 6],
    [6, 6],
    [6, 6],
  ]);
  const padding = inset(outer, 1);
  const scale = Math.min((w - 2) / 100, (h - 2) / 90);
  const stroke = (
    d: string,
    width: number,
    cap: 'butt' | 'round',
    color: DrawColor,
  ): DrawCommand => ({
    op: 'path',
    d,
    style: 'stroke',
    width,
    cap,
    color,
    alpha: 1,
  });
  return [
    {
      op: 'fill',
      shape: shape(outer),
      paint: { k: 'color', color: role('sheet') },
      alpha: 1,
      blend: 'srcOver',
    },
    ring(padding, inset(padding, 1), role('material-edge'), 1),
    ring(outer, padding, role('rule-2'), 1),
    { op: 'save' },
    { op: 'clip', shape: shape(padding) },
    {
      op: 'concat',
      matrix: translate(
        1 + (w - 2 - 100 * scale) / 2,
        1 + (h - 2 - 90 * scale) / 2,
        scale,
      ),
    },
    stroke(DIAL_ARC, 3, 'round', role('rule-2')),
    stroke(DIAL_TICKS, 1.4, 'butt', role('ink-3')),
    { op: 'save' },
    { op: 'concat', matrix: rotation(round(dial.angle, 2), 50, 50) },
    stroke(DIAL_NEEDLE, 3, 'butt', role('ink')),
    { op: 'restore' },
    {
      op: 'fill',
      shape: { k: 'ellipse', rect: rect(45.5, 45.5, 9, 9) },
      paint: { k: 'color', color: role('ink') },
      alpha: 1,
      blend: 'srcOver',
    },
    dialText(
      dial.value,
      72,
      { weight: 600, size: 11, letterSpacing: 0, lineHeight: 1 },
      role('ink'),
    ),
    dialText(
      DIAL_LABEL,
      84,
      { weight: 400, size: 5.6, letterSpacing: 0, lineHeight: 1 },
      role('ink-3'),
    ),
    { op: 'restore' },
  ];
}
