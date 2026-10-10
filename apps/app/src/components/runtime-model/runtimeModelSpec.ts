/**
 * Shared stage geometry for every runtime-model renderer. The DOM renderer
 * (web) and the Skia renderer (Android) both consume these values, so the two
 * platforms draw the same composition. Pure data: no React Native or DOM
 * imports.
 */

export type RuntimeModelVariant = 'firstRun' | 'runtime';

export interface RuntimeModelSpec {
  readonly variant: RuntimeModelVariant;
  readonly width: number;
  readonly height: number;
  /** World unit U in device pixels. */
  readonly unit: number;
  /** Camera origin as fractions of the stage size. */
  readonly origin: { readonly x: number; readonly y: number };
  /** Perspective pivot as fractions of the stage size. */
  readonly pivot: { readonly x: number; readonly y: number };
  /** `faces-dial-dots` omits the billboard pins and tags. */
  readonly layers: 'full' | 'faces-dial-dots';
}

export const RUNTIME_MODEL_SPECS: Record<
  RuntimeModelVariant,
  RuntimeModelSpec
> = {
  firstRun: {
    variant: 'firstRun',
    width: 390,
    height: 350,
    unit: 5.6,
    origin: { x: 0.465, y: 0.51 },
    pivot: { x: 0.465, y: 0.42 },
    layers: 'full',
  },
  runtime: {
    variant: 'runtime',
    width: 390,
    height: 300,
    unit: 5.6,
    origin: { x: 0.479, y: 0.44 },
    pivot: { x: 0.479, y: 0.34 },
    layers: 'faces-dial-dots',
  },
};

/** Props every platform renderer of `RuntimeModelCanvas` must accept. */
export interface RuntimeModelCanvasProps {
  readonly spec: RuntimeModelSpec;
  /** Localized pin titles keyed by the story pin id. */
  readonly pinLabels: Readonly<Record<string, string>>;
  /** Reduced motion draws the resting frame; see `restingView` for the time. */
  readonly reducedMotion: boolean;
  /** Stops the animation loop while the screen is off-focus or backgrounded. */
  readonly paused: boolean;
}
