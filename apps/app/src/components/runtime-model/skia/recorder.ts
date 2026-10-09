import type {
  BlendMode,
  ClipOp,
  FontWeight,
  PaintStyle,
  PathOp,
  SkCanvas,
  SkPaint,
  SkParagraph,
  SkPath,
  SkPicture,
  SkPoint,
  SkShader,
  SkTypefaceFontProvider,
  Skia,
  StrokeCap,
  StrokeJoin,
  TextAlign,
  TileMode,
} from '@shopify/react-native-skia';
import { tokens } from '@zapengine/design-tokens/tokens';
import type {
  DrawCommand,
  DrawFont,
  DrawList,
  DrawPaint,
  DrawShape,
  Point2,
  TextMeasure,
} from '@zapengine/zap-pilot-story/model';
import { skiaColor } from './colors';

type SkiaApi = typeof Skia;

// Skia enum values, so this module needs only the injected API at runtime.
const SRC_OVER = 3 as BlendMode;
const DST_IN = 6 as BlendMode;
const CLAMP = 0 as TileMode;
const REPEAT = 1 as TileMode;
const FILL = 0 as PaintStyle;
const STROKE = 1 as PaintStyle;
const BUTT = 0 as StrokeCap;
const ROUND = 1 as StrokeCap;
const MITER_JOIN = 0 as StrokeJoin;
const ROUND_JOIN = 1 as StrokeJoin;
const INTERSECT = 1 as ClipOp;
const DIFFERENCE = 0 as PathOp;
const LEFT = 0 as TextAlign;
const CENTER = 2 as TextAlign;
// SkGradientShader::kInterpolateColorsInPremul_Flag: CSS gradients mix premultiplied.
const PREMULTIPLIED = 1;
const CACHE_LIMIT = 512;
const UNBOUNDED = 1e6;
const MEASURE_INK = new Float32Array(4);

const MONO = tokens.font.native;
/** Static Martian Mono instances, keyed by the runtime family names the app registers. */
export const SKIA_MONO_FAMILIES = [
  MONO.mono.family,
  MONO['mono-medium'].family,
  MONO['mono-semibold'].family,
] as const;
// No static instance is heavier than SemiBold, so 700 shares it.
const family = (weight: number) =>
  weight >= 600
    ? MONO['mono-semibold'].family
    : weight >= 500
      ? MONO['mono-medium'].family
      : MONO.mono.family;

export interface SkiaRecorder {
  readonly measure: TextMeasure;
  record(list: DrawList): SkPicture;
}

function unknownCommand(value: never): never {
  throw new Error(`Unknown draw command: ${JSON.stringify(value)}`);
}

/**
 * Replays drawing lists into Skia pictures. Paragraphs, shaders and SVG paths are
 * cached for the recorder's lifetime (one per spec and font set).
 */
export function createSkiaRecorder(
  skia: SkiaApi,
  fonts: SkTypefaceFontProvider,
): SkiaRecorder {
  const paragraphs = new Map<string, SkParagraph>();
  const shaders = new Map<string, SkShader>();
  const svgPaths = new Map<string, SkPath>();
  function cached<T>(cache: Map<string, T>, key: string, make: () => T): T {
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    if (cache.size >= CACHE_LIMIT) cache.clear();
    const value = make();
    cache.set(key, value);
    return value;
  }
  const point = (p: Point2 | undefined): SkPoint =>
    skia.Point(p?.[0] ?? 0, p?.[1] ?? 0);

  function paragraph(
    text: string,
    font: DrawFont,
    color: Float32Array,
    width: number,
    align: 'left' | 'center',
  ): SkParagraph {
    const key = [
      text,
      font.weight,
      font.size,
      font.letterSpacing,
      font.lineHeight,
      color.join(','),
      width,
      align,
    ].join('\u0000');
    return cached(paragraphs, key, () => {
      const builder = skia.ParagraphBuilder.Make(
        { textAlign: align === 'center' ? CENTER : LEFT },
        fonts,
      );
      builder.pushStyle({
        fontFamilies: [family(font.weight)],
        fontSize: font.size,
        fontStyle: { weight: font.weight as FontWeight },
        letterSpacing: font.letterSpacing,
        heightMultiplier: font.lineHeight,
        halfLeading: true,
        color,
      });
      builder.addText(text);
      const built = builder.build();
      built.layout(width);
      return built;
    });
  }

  const measure: TextMeasure = (text, font) =>
    paragraph(
      text,
      font,
      MEASURE_INK,
      UNBOUNDED,
      'left',
    ).getMaxIntrinsicWidth();

  function makeShader(paint: Exclude<DrawPaint, { k: 'color' }>): SkShader {
    switch (paint.k) {
      case 'linear':
        return skia.Shader.MakeLinearGradient(
          point(paint.from),
          point(paint.to),
          paint.stops.map((s) => skiaColor(s.color)),
          paint.stops.map((s) => s.offset),
          paint.repeat ? REPEAT : CLAMP,
          undefined,
          PREMULTIPLIED,
        );
      case 'radial': {
        // A unit circle stretched onto the gradient's ellipse.
        const [rx, ry] = paint.radius;
        return skia.Shader.MakeRadialGradient(
          skia.Point(0, 0),
          1,
          paint.stops.map((s) => skiaColor(s.color)),
          paint.stops.map((s) => s.offset),
          CLAMP,
          skia.Matrix([
            Math.max(rx, 1e-6),
            0,
            paint.center[0],
            0,
            Math.max(ry, 1e-6),
            paint.center[1],
            0,
            0,
            1,
          ]),
          PREMULTIPLIED,
        );
      }
      case 'blend':
        return skia.Shader.MakeBlend(
          paint.mode === 'dstIn' ? DST_IN : SRC_OVER,
          shader(paint.dst),
          shader(paint.src),
        );
      default:
        return unknownCommand(paint);
    }
  }
  function shader(paint: DrawPaint): SkShader {
    if (paint.k === 'color')
      return skia.Shader.MakeColor(skiaColor(paint.color));
    return cached(shaders, JSON.stringify(paint), () => makeShader(paint));
  }

  function path(shape: DrawShape): SkPath {
    switch (shape.k) {
      case 'rect': {
        const area = skia.XYWHRect(
          shape.rect.x,
          shape.rect.y,
          shape.rect.w,
          shape.rect.h,
        );
        const [topLeft, topRight, bottomRight, bottomLeft] = shape.radii;
        return shape.radii.some(([x, y]) => x > 0 || y > 0)
          ? skia.Path.RRect({
              rect: area,
              topLeft: point(topLeft),
              topRight: point(topRight),
              bottomRight: point(bottomRight),
              bottomLeft: point(bottomLeft),
            })
          : skia.Path.Rect(area);
      }
      case 'polygon':
        return skia.Path.Polygon(shape.points.map(point), true);
      case 'line':
        return skia.Path.Polygon(shape.points.map(point), false);
      case 'ellipse':
        return skia.Path.Oval(
          skia.XYWHRect(shape.rect.x, shape.rect.y, shape.rect.w, shape.rect.h),
        );
      case 'difference':
        return (
          skia.Path.MakeFromOp(
            path(shape.outer),
            path(shape.inner),
            DIFFERENCE,
          ) ?? skia.Path.Make()
        );
      default:
        return unknownCommand(shape);
    }
  }

  function strokePaint(
    width: number,
    color: Float32Array,
    cap: 'butt' | 'round',
  ): SkPaint {
    const paint = skia.Paint();
    paint.setAntiAlias(true);
    paint.setStyle(STROKE);
    paint.setStrokeWidth(width);
    paint.setStrokeCap(cap === 'round' ? ROUND : BUTT);
    paint.setStrokeJoin(cap === 'round' ? ROUND_JOIN : MITER_JOIN);
    paint.setColor(color);
    return paint;
  }

  function run(canvas: SkCanvas, command: DrawCommand): void {
    switch (command.op) {
      case 'save':
        canvas.save();
        return;
      case 'restore':
        canvas.restore();
        return;
      case 'concat':
        canvas.concat([...command.matrix]);
        return;
      case 'layer': {
        const paint = skia.Paint();
        paint.setAlphaf(command.alpha);
        const { x, y, w, h } = command.bounds;
        canvas.saveLayer(paint, skia.XYWHRect(x, y, w, h));
        return;
      }
      case 'clip':
        canvas.clipPath(path(command.shape), INTERSECT, true);
        return;
      case 'fill': {
        const paint = skia.Paint();
        paint.setAntiAlias(true);
        paint.setStyle(FILL);
        if (command.paint.k === 'color') {
          paint.setColor(skiaColor(command.paint.color, command.alpha));
        } else {
          paint.setShader(shader(command.paint));
          paint.setAlphaf(command.alpha);
        }
        if (command.blend === 'dstIn') paint.setBlendMode(DST_IN);
        canvas.drawPath(path(command.shape), paint);
        return;
      }
      case 'stroke': {
        const paint = strokePaint(
          command.width,
          skiaColor(command.color, command.alpha),
          'butt',
        );
        if (command.dash) {
          paint.setPathEffect(skia.PathEffect.MakeDash([...command.dash], 0));
        }
        canvas.drawPath(path(command.shape), paint);
        return;
      }
      case 'path': {
        const glyph = cached(
          svgPaths,
          command.d,
          () => skia.Path.MakeFromSVGString(command.d) ?? skia.Path.Make(),
        );
        const color = skiaColor(command.color, command.alpha);
        const paint =
          command.style === 'stroke'
            ? strokePaint(command.width, color, command.cap)
            : skia.Paint();
        if (command.style === 'fill') {
          paint.setAntiAlias(true);
          paint.setColor(color);
        }
        canvas.drawPath(glyph, paint);
        return;
      }
      case 'text': {
        const laid = paragraph(
          command.text,
          command.font,
          skiaColor(command.color, command.alpha),
          command.width,
          command.align,
        );
        const top =
          command.origin === 'baseline'
            ? command.y - (laid.getLineMetrics()[0]?.baseline ?? 0)
            : command.y;
        laid.paint(canvas, command.x, top);
        return;
      }
      default:
        unknownCommand(command);
    }
  }

  return {
    measure,
    record(list) {
      const recorder = skia.PictureRecorder();
      const canvas = recorder.beginRecording(
        skia.XYWHRect(0, 0, list.width, list.height),
      );
      for (const command of list.commands) run(canvas, command);
      return recorder.finishRecordingAsPicture();
    },
  };
}
