import type { ColorToken } from './scene.js';
/** Row-major 3×3 matrix; faces carry the perspective homography of their local plane. */
export type Matrix3 = readonly number[];
export type Point2 = readonly [number, number];
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
/** Scene colour tokens plus the two chrome roles used by billboards and the dial. */
export type DrawRole = ColorToken | 'sheet' | 'rule';
/** `shade` is black at `alpha`, as in the SIGN key's inset shading. */
export type DrawColor =
  | { readonly k: 'token'; readonly id: DrawRole }
  | { readonly k: 'transparent' }
  | {
      readonly k: 'mix';
      readonly a: DrawColor;
      readonly pct: number;
      readonly b: DrawColor;
    }
  | { readonly k: 'shade'; readonly alpha: number };
export interface DrawStop {
  readonly offset: number;
  readonly color: DrawColor;
}
/** Gradients interpolate in premultiplied sRGB, as CSS does. */
export type DrawPaint =
  | { readonly k: 'color'; readonly color: DrawColor }
  | {
      readonly k: 'linear';
      readonly from: Point2;
      readonly to: Point2;
      readonly stops: readonly DrawStop[];
      readonly repeat: boolean;
    }
  | {
      readonly k: 'radial';
      readonly center: Point2;
      /** Ellipse radii along x and y. */
      readonly radius: Point2;
      readonly stops: readonly DrawStop[];
    }
  | {
      readonly k: 'blend';
      readonly mode: 'srcOver' | 'dstIn';
      readonly dst: DrawPaint;
      readonly src: DrawPaint;
    };
export type DrawShape =
  /** Corner radii run top-left, top-right, bottom-right, bottom-left. */
  | {
      readonly k: 'rect';
      readonly rect: Rect;
      readonly radii: readonly Point2[];
    }
  | { readonly k: 'polygon'; readonly points: readonly Point2[] }
  /** An open polyline, only meaningful for strokes. */
  | { readonly k: 'line'; readonly points: readonly Point2[] }
  | { readonly k: 'ellipse'; readonly rect: Rect }
  | {
      readonly k: 'difference';
      readonly outer: DrawShape;
      readonly inner: DrawShape;
    };
/** Martian Mono at a CSS weight; sizes and spacing are device pixels. */
export interface DrawFont {
  readonly weight: number;
  readonly size: number;
  readonly letterSpacing: number;
  /** CSS line-height multiplier, distributed as half-leading. */
  readonly lineHeight: number;
}
export type DrawCommand =
  | { readonly op: 'save' }
  | { readonly op: 'restore' }
  | { readonly op: 'concat'; readonly matrix: Matrix3 }
  /** Group opacity; closed by the matching `restore`. */
  | { readonly op: 'layer'; readonly alpha: number; readonly bounds: Rect }
  | { readonly op: 'clip'; readonly shape: DrawShape }
  | {
      readonly op: 'fill';
      readonly shape: DrawShape;
      readonly paint: DrawPaint;
      readonly alpha: number;
      readonly blend: 'srcOver' | 'dstIn';
    }
  | {
      readonly op: 'stroke';
      readonly shape: DrawShape;
      readonly width: number;
      /** Dash and gap lengths, or null for a solid stroke. */
      readonly dash: readonly number[] | null;
      readonly color: DrawColor;
      readonly alpha: number;
    }
  | {
      readonly op: 'path';
      /** SVG path data in the current coordinate system. */
      readonly d: string;
      readonly style: 'fill' | 'stroke';
      readonly width: number;
      readonly cap: 'butt' | 'round';
      readonly color: DrawColor;
      readonly alpha: number;
    }
  | {
      readonly op: 'text';
      readonly text: string;
      readonly x: number;
      /** Top of the first line box, or the first baseline when `origin` is `baseline`. */
      readonly y: number;
      /** Wrapping width; `align` positions lines inside it. */
      readonly width: number;
      readonly align: 'left' | 'center';
      readonly origin: 'top' | 'baseline';
      readonly font: DrawFont;
      readonly color: DrawColor;
      readonly alpha: number;
    };
export interface DrawList {
  readonly width: number;
  readonly height: number;
  /** Painter's order, back to front. */
  readonly commands: readonly DrawCommand[];
}
/** Advance width of a single unwrapped line. Hosts measure with their own text engine. */
export type TextMeasure = (text: string, font: DrawFont) => number;
export type EngineLayer = 'faces' | 'dial' | 'dots' | 'tags' | 'pins';
