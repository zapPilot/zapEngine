function unknownScene(value: never): never {
  throw new Error(`Unknown scene variant: ${JSON.stringify(value)}`);
}
import { worldLength } from './geometry.js';
import type {
  EngineFrame,
  SceneColor,
  Fill,
  Length,
  Border,
  Radius,
  Shadow,
  Mask,
  Clip,
  TransformOp,
  PinGlyph,
} from './scene.js';
export function colorCss(color: SceneColor): string {
  switch (color.k) {
    case 'token':
      return `var(--${color.id})`;
    case 'transparent':
      return 'transparent';
    case 'mix':
      return `color-mix(in srgb, ${colorCss(color.a)} ${color.digits === null ? color.pct : color.pct.toFixed(color.digits)}%, ${colorCss(color.b)})`;
    default:
      return unknownScene(color);
  }
}
export function fillCss(fill: Fill): string {
  switch (fill.k) {
    case 'token':
    case 'transparent':
    case 'mix':
      return colorCss(fill);
    case 'linear135':
      return `linear-gradient(135deg, ${colorCss(fill.a)}, ${colorCss(fill.b)})`;
    case 'radialShadow':
      return 'radial-gradient(closest-side, var(--material-shadow), transparent)';
    case 'stripes':
      return `repeating-linear-gradient(to bottom, var(--material-edge) 0 1px, transparent 1px calc(${fill.step} * var(--zp-u))), ${colorCss(fill.base)}`;
    case 'grid': {
      const step = worldLength(fill.step);
      const size = `${step} ${step}`;
      return `linear-gradient(var(--material-floor) 1px, transparent 1px) 0 0 / ${size}, linear-gradient(90deg, var(--material-floor) 1px, transparent 1px) 0 0 / ${size}`;
    }
    default:
      return unknownScene(fill);
  }
}
export function lengthCss(length: Length): string {
  switch (length.k) {
    case 'world':
      return worldLength(length.n);
    case 'px':
      return `${length.n}px`;
    case 'bare':
      return String(length.n);
    default:
      return unknownScene(length);
  }
}
export function borderCss(border: Border): string {
  return `${lengthCss(border.width)} ${border.style} ${colorCss(border.color)}`;
}
export function radiusCss(radius: Radius): string {
  switch (radius.k) {
    case 'corners':
      return radius.values.map(lengthCss).join(' ');
    case 'percent':
      return `${radius.n}%`;
    default:
      return unknownScene(radius);
  }
}
export function shadowCss(shadow: Shadow): string {
  switch (shadow.k) {
    case 'none':
      return 'none';
    case 'insetEdge':
      return 'inset 0 0 0 1px var(--material-edge)';
    case 'signRing':
      return `0 0 0 ${shadow.spread.toFixed(1)}px color-mix(in srgb, var(--sign) ${shadow.pct.toFixed(0)}%, transparent), inset 0 -3px 0 rgba(0,0,0,.22)`;
    default:
      return unknownScene(shadow);
  }
}
export function maskCss(mask: Mask): string {
  switch (mask.k) {
    case 'none':
      return 'none';
    case 'floor':
      return 'radial-gradient(closest-side, #000 35%, transparent)';
    case 'signWash':
      return 'radial-gradient(farthest-side at 50% 0%, #000 45%, transparent)';
    case 'signStrip':
      return 'linear-gradient(90deg, transparent, #000 25%, #000 75%, transparent)';
    default:
      return unknownScene(mask);
  }
}
export function clipCss(clip: Clip): string {
  switch (clip.k) {
    case 'none':
      return 'none';
    case 'triangle':
      return 'polygon(0 0, 100% 0, 50% 100%)';
    case 'hexagon':
      return 'polygon(100% 50%, 75% 93.3%, 25% 93.3%, 0 50%, 25% 6.7%, 75% 6.7%)';
    case 'circle':
      return 'circle(50%)';
    default:
      return unknownScene(clip);
  }
}
export function transformCss(ops: readonly TransformOp[]): string {
  return ops
    .map((op) => {
      switch (op.k) {
        case 'T':
          return `translate3d(${worldLength(op.x)},${worldLength(op.y)},${worldLength(op.z)})`;
        case 'RX':
        case 'RY':
        case 'RZ':
          return `rotate${op.k[1]}(${op.digits === null ? op.deg : op.deg.toFixed(op.digits)}deg)`;
        case 'S':
          return `scale(${op.value.toFixed(op.digits)})`;
        case 'anchor':
          return `translate(${op.x}%,${op.y}%)`;
        default:
          return unknownScene(op);
      }
    })
    .join(' ');
}
const percentage = (value: number) => Number((value * 100).toFixed(6));
const PIN_CLASS: Record<PinGlyph, string> = {
  none: 'st-none',
  live: 'st-live',
  planned: 'st-plan',
  'in-development': 'st-dev',
  research: 'st-res',
};
const BILLBOARD_FONT = 'clamp(10px, calc(.95 * var(--zp-u)), 15px)';
export function serializeEngineCss(frame: EngineFrame) {
  const camera = frame.camera;
  return {
    cam: `scale(${camera.scale.toFixed(4)}) rotateX(${camera.ax.toFixed(2)}deg) rotateZ(${camera.az.toFixed(2)}deg) translate3d(${worldLength(-camera.center[0])},${worldLength(-camera.center[1])},${worldLength(-camera.center[2])})`,
    faces: frame.faces.map((face) => ({
      w: worldLength(face.w),
      h: worldLength(face.h),
      tf: transformCss(face.ops),
      bg: fillCss(face.fill),
      bd: borderCss(face.border),
      rad: radiusCss(face.radius),
      op: face.op.toFixed(3),
      sh: shadowCss(face.shadow),
      fg: colorCss(face.text.color),
      fs: worldLength(face.text.size),
      fw: face.text.weight,
      pad: face.text.padding.map(lengthCss).join(' '),
      ta: face.text.align,
      mask: maskCss(face.mask),
      text: face.text.value,
      glyph: face.glyph,
      clip: clipCss(face.clip),
    })),
    labels: frame.pins.map((pin) => ({
      asset: pin.asset,
      tf: transformCss(pin.ops),
      op: pin.op.toFixed(3),
      t: pin.title,
      s: pin.subtitle,
      g: PIN_CLASS[pin.glyph],
      cls: `blb-box ${pin.tone}`,
      stem: worldLength(pin.stem),
      fs: BILLBOARD_FONT,
    })),
    tags: frame.tags.map((tag) => ({
      tf: transformCss(tag.ops),
      op: tag.op.toFixed(3),
      n: tag.number,
      t: tag.title,
      s: tag.subtitle,
      cls: `tag-box ${tag.tone}`,
      fs: BILLBOARD_FONT,
    })),
    dots: frame.dots.map((dot) => ({
      tf: transformCss(dot.ops),
      sz: `${dot.size}px`,
      bg: colorCss(dot.color),
      op: dot.op.toFixed(3),
    })),
    dial: {
      w: worldLength(frame.dial.w),
      h: worldLength(frame.dial.h),
      tf: transformCss(frame.dial.ops),
      ang: frame.dial.angle.toFixed(2),
      val: frame.dial.value,
    },
    persp: worldLength(frame.perspective),
    ox: `${percentage(frame.origin[0])}%`,
    oy: `${percentage(frame.origin[1])}%`,
    po: `${percentage(frame.perspectiveOrigin[0])}% ${percentage(frame.perspectiveOrigin[1])}%`,
  };
}
