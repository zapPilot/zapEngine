import { createElement, type CSSProperties, type ReactNode } from 'react';

/**
 * A recording stand-in for the part of `@shopify/react-native-skia` the runtime
 * model uses. Pictures keep the canvas calls that produced them, so tests can read
 * what a frame drew. It proves call sequences, not pixels; the headless CanvasKit
 * render in docs/skia-spike.md covers rasterization.
 */
export interface SkiaCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

export class FakePaint {
  readonly settings: Record<string, unknown> = {};
  private set(key: string) {
    return (value: unknown) => {
      this.settings[key] = value;
    };
  }
  setAntiAlias = this.set('antiAlias');
  setStyle = this.set('style');
  setStrokeWidth = this.set('strokeWidth');
  setStrokeCap = this.set('strokeCap');
  setStrokeJoin = this.set('strokeJoin');
  setColor = this.set('color');
  setAlphaf = this.set('alpha');
  setShader = this.set('shader');
  setPathEffect = this.set('pathEffect');
  setBlendMode = this.set('blendMode');
}

export interface FakePath {
  readonly path: string;
  readonly args: readonly unknown[];
}

export interface FakeShader {
  readonly shader: string;
  readonly args: readonly unknown[];
}

export class FakeParagraph {
  width = Number.NaN;
  constructor(
    readonly text: string,
    readonly style: Record<string, unknown>,
    readonly paragraphStyle: Record<string, unknown>,
    readonly fonts: unknown,
  ) {}
  layout(width: number) {
    this.width = width;
  }
  getMaxIntrinsicWidth() {
    return [...this.text].length * 6;
  }
  getLineMetrics() {
    return this.text === 'no-lines' ? [] : [{ baseline: 8 }];
  }
  paint(canvas: FakeCanvas, x: number, y: number) {
    canvas.calls.push({ method: 'paragraph', args: [this, x, y] });
  }
}

export class FakeCanvas {
  readonly calls: SkiaCall[] = [];
  private record(method: string) {
    return (...args: unknown[]) => {
      this.calls.push({ method, args });
    };
  }
  save = this.record('save');
  restore = this.record('restore');
  concat = this.record('concat');
  saveLayer = this.record('saveLayer');
  clipPath = this.record('clipPath');
  drawPath = this.record('drawPath');
}

export interface FakePicture {
  readonly id: number;
  readonly bounds: unknown;
  readonly calls: readonly SkiaCall[];
}

export const skiaTestRuntime = {
  fontsReady: true,
  fontSources: null as Record<string, unknown[]> | null,
  /** Every picture recorded, in order. */
  recorded: [] as FakePicture[],
  paragraphs: 0,
  shaders: 0,
  svgPaths: 0,
  reset() {
    Object.assign(this, {
      fontsReady: true,
      fontSources: null,
      recorded: [],
      paragraphs: 0,
      shaders: 0,
      svgPaths: 0,
    });
  },
};

const path = (name: string, ...args: unknown[]): FakePath => ({
  path: name,
  args,
});
function shader(name: string, ...args: unknown[]): FakeShader {
  skiaTestRuntime.shaders += 1;
  return { shader: name, args };
}

export const fakeSkia = {
  Point: (x: number, y: number) => ({ x, y }),
  XYWHRect: (x: number, y: number, width: number, height: number) => ({
    x,
    y,
    width,
    height,
  }),
  Matrix: (matrix: readonly number[]) => ({ matrix }),
  Paint: () => new FakePaint(),
  Path: {
    Make: () => path('empty'),
    Rect: (rect: unknown) => path('rect', rect),
    RRect: (rrect: unknown) => path('rrect', rrect),
    Oval: (rect: unknown) => path('oval', rect),
    Polygon: (points: unknown, close: boolean) =>
      path('polygon', points, close),
    // A difference whose subtrahend is empty fails, like an invalid path op.
    MakeFromOp: (one: FakePath, two: FakePath, op: number) =>
      two.path === 'polygon' && (two.args[0] as unknown[]).length === 0
        ? null
        : path('op', one, two, op),
    MakeFromSVGString: (d: string) => {
      skiaTestRuntime.svgPaths += 1;
      return d === 'not a path' ? null : path('svg', d);
    },
  },
  PathEffect: {
    MakeDash: (intervals: number[], phase: number) => ({ intervals, phase }),
  },
  Shader: {
    MakeColor: (color: unknown) => shader('color', color),
    MakeLinearGradient: (...args: unknown[]) => shader('linear', ...args),
    MakeRadialGradient: (...args: unknown[]) => shader('radial', ...args),
    MakeBlend: (...args: unknown[]) => shader('blend', ...args),
  },
  ParagraphBuilder: {
    Make: (paragraphStyle: Record<string, unknown>, fonts: unknown) => {
      let style: Record<string, unknown> = {};
      let text = '';
      const builder = {
        pushStyle: (next: Record<string, unknown>) => {
          style = next;
          return builder;
        },
        addText: (next: string) => {
          text += next;
          return builder;
        },
        build: () => {
          skiaTestRuntime.paragraphs += 1;
          return new FakeParagraph(text, style, paragraphStyle, fonts);
        },
      };
      return builder;
    },
  },
  PictureRecorder: () => {
    const canvas = new FakeCanvas();
    let bounds: unknown;
    return {
      beginRecording: (rect: unknown) => {
        bounds = rect;
        return canvas;
      },
      finishRecordingAsPicture: (): FakePicture => {
        const picture = {
          id: skiaTestRuntime.recorded.length + 1,
          bounds,
          calls: canvas.calls,
        };
        skiaTestRuntime.recorded.push(picture);
        return picture;
      },
    };
  },
};

export const FAKE_FONTS = { fontProvider: 'martian-mono' };

/** Texts a recorded picture painted, in order. */
export const paintedTexts = (picture: FakePicture) =>
  picture.calls
    .filter((call) => call.method === 'paragraph')
    .map((call) => (call.args[0] as FakeParagraph).text);

export const skiaStub = {
  Skia: fakeSkia,
  Canvas: ({
    children,
    style,
  }: {
    children?: ReactNode;
    style?: CSSProperties;
  }) => createElement('div', { 'data-testid': 'skia-canvas', style }, children),
  Picture: ({ picture }: { picture: FakePicture }) =>
    createElement('i', { 'data-picture': picture.id }),
  useFonts: (sources: Record<string, unknown[]>) => {
    skiaTestRuntime.fontSources = sources;
    return skiaTestRuntime.fontsReady ? FAKE_FONTS : null;
  },
};
