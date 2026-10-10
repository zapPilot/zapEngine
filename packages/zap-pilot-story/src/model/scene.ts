import type { Sleeve } from './asset-glyphs.js';
import type { CapabilityStatus } from '../facts/capability-status.js';
export type TransformOp =
  | { k: 'T'; x: number; y: number; z: number }
  | { k: 'RX' | 'RY' | 'RZ'; deg: number; digits: number | null }
  | { k: 'S'; value: number; digits: number }
  | { k: 'anchor'; x: number; y: number };
export type ColorToken =
  | 'ink'
  | 'ink-2'
  | 'ink-3'
  | 'ground'
  | 'sign'
  | 'sign-wash'
  | 'sign-ink'
  | 'on-sign'
  | 'rule-2'
  | 'material-edge'
  | 'material-top'
  | 'material-front'
  | 'material-left'
  | 'material-shadow'
  | 'material-floor'
  | 'material-ink-top'
  | 'material-ink-front'
  | 'material-ink-left'
  | `sleeve-${Sleeve}`;
export type SceneColor =
  | { k: 'token'; id: ColorToken }
  | { k: 'transparent' }
  | {
      k: 'mix';
      a: SceneColor;
      pct: number;
      b: SceneColor;
      digits: number | null;
    };
export type Fill =
  | SceneColor
  | { k: 'linear135'; a: SceneColor; b: SceneColor }
  | { k: 'radialShadow' }
  | { k: 'stripes'; step: number; base: SceneColor }
  | { k: 'grid'; step: number };
export type Length =
  | { k: 'px'; n: number }
  | { k: 'world'; n: number }
  | { k: 'bare'; n: number };
export interface Border {
  width: Length;
  style: 'none' | 'solid' | 'dashed';
  color: SceneColor;
}
export type Radius =
  | { k: 'corners'; values: readonly Length[] }
  | { k: 'percent'; n: number };
export type Shadow =
  | { k: 'none' }
  | { k: 'insetEdge' }
  | { k: 'signRing'; spread: number; pct: number };
export type Mask =
  | { k: 'none' }
  | { k: 'floor' }
  | { k: 'signWash' }
  | { k: 'signStrip' };
export type Clip =
  | { k: 'none' }
  | { k: 'triangle' }
  | { k: 'hexagon' }
  | { k: 'circle' };
export interface SceneText {
  value: string;
  color: SceneColor;
  size: number;
  weight: number;
  padding: readonly Length[];
  align: 'left' | 'center';
}
export interface SceneFace {
  ops: readonly TransformOp[];
  w: number;
  h: number;
  op: number;
  layer: 'floor' | 'solid';
  group: string;
  fill: Fill;
  border: Border;
  radius: Radius;
  shadow: Shadow;
  mask: Mask;
  clip: Clip;
  text: SceneText;
  glyph: Sleeve | undefined;
}
export type PinTone = '' | 'ink' | 'plan' | 'sign';
export type PinGlyph = CapabilityStatus | 'none';
export interface ScenePin {
  id: string;
  anchor: readonly number[];
  ops: readonly TransformOp[];
  op: number;
  title: string;
  subtitle: string;
  glyph: PinGlyph;
  tone: PinTone;
  stem: number;
  asset: Sleeve | undefined;
}
export interface SceneTag {
  anchor: readonly number[];
  ops: readonly TransformOp[];
  op: number;
  number: string;
  title: string;
  subtitle: string;
  tone: PinTone;
}
export interface SceneDot {
  anchor: readonly number[];
  ops: readonly TransformOp[];
  size: number;
  color: SceneColor;
  op: number;
}
export interface EngineFrame {
  camera: {
    ax: number;
    az: number;
    scale: number;
    center: readonly [number, number, number];
  };
  faces: readonly SceneFace[];
  pins: readonly ScenePin[];
  tags: readonly SceneTag[];
  dots: readonly SceneDot[];
  dial: {
    w: number;
    h: number;
    ops: readonly TransformOp[];
    angle: number;
    value: string;
  };
  perspective: number;
  origin: readonly [number, number];
  perspectiveOrigin: readonly [number, number];
}
export interface EngineFacts {
  dmaDistance: Readonly<Record<string, number>>;
  held: readonly number[];
  target: readonly number[];
}
export const token = (id: ColorToken): SceneColor => ({ k: 'token', id });
export const transparent: SceneColor = { k: 'transparent' };
export const mix = (
  a: SceneColor,
  pct: number,
  b: SceneColor,
  digits: number | null = null,
): SceneColor => ({ k: 'mix', a, pct, b, digits });
export const px = (n: number): Length => ({ k: 'px', n });
export const world = (n: number): Length => ({ k: 'world', n });
export const bare = (n: number): Length => ({ k: 'bare', n });
export const corners = (...values: Length[]): Radius => ({
  k: 'corners',
  values,
});
export const border = (
  n: number,
  color: SceneColor,
  style: Border['style'] = 'solid',
): Border => ({ width: px(n), color, style });
export const rotation = (
  k: 'RX' | 'RY' | 'RZ',
  deg: number,
  digits: number | null = null,
): TransformOp => ({ k, deg, digits });
export const translate = (x: number, y: number, z: number): TransformOp[] => [
  { k: 'T', x, y, z },
];
