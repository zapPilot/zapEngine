import { tokens } from '@zapengine/design-tokens/tokens';
import type { DrawColor, DrawRole } from '@zapengine/zap-pilot-story/model';

const mode = tokens.mode.night;
const material = tokens.material.night;
const sleeve = tokens.sleeve.night;

/** Every drawing role resolves to the night palette; a new scene token fails to compile here. */
const ROLES: Readonly<Record<DrawRole, string>> = {
  ink: mode.ink,
  'ink-2': mode['ink-2'],
  'ink-3': mode['ink-3'],
  ground: mode.ground,
  sheet: mode.sheet,
  rule: mode.rule,
  'rule-2': mode['rule-2'],
  sign: mode.sign,
  'sign-wash': mode['sign-wash'],
  'sign-ink': mode['sign-ink'],
  'on-sign': mode['on-sign'],
  'material-edge': material.edge,
  'material-top': material.top,
  'material-front': material.front,
  'material-left': material.left,
  'material-shadow': material.shadow,
  'material-floor': material.floor,
  'material-ink-top': material['ink-top'],
  'material-ink-front': material['ink-front'],
  'material-ink-left': material['ink-left'],
  'sleeve-btc': sleeve.btc,
  'sleeve-eth': sleeve.eth,
  'sleeve-spy': sleeve.spy,
  'sleeve-stable': sleeve.stable,
};

/** Premultiplied sRGB in 0..1. */
type Premultiplied = readonly [number, number, number, number];

const HEX = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i;
const FUNCTIONAL = /^rgba?\(([^)]+)\)$/i;

/** Parses the token formats in tokens.json: `#rrggbb` and `rgba(r, g, b, a)`. */
export function parseTokenColor(css: string): Premultiplied {
  const hex = HEX.exec(css);
  if (hex) {
    return [
      parseInt(hex[1]!, 16) / 255,
      parseInt(hex[2]!, 16) / 255,
      parseInt(hex[3]!, 16) / 255,
      1,
    ];
  }
  const functional = FUNCTIONAL.exec(css);
  if (!functional) throw new Error(`Unsupported token colour: ${css}`);
  const [r = 0, g = 0, b = 0, a = 1] = functional[1]!
    .split(',')
    .map((part) => Number.parseFloat(part));
  return [(r / 255) * a, (g / 255) * a, (b / 255) * a, a];
}

function unknownColor(value: never): never {
  throw new Error(`Unknown draw colour: ${JSON.stringify(value)}`);
}

/** CSS `color-mix(in srgb, a p%, b)` interpolates premultiplied channels. */
function premultiplied(color: DrawColor): Premultiplied {
  switch (color.k) {
    case 'token':
      return parseTokenColor(ROLES[color.id]);
    case 'transparent':
      return [0, 0, 0, 0];
    case 'shade':
      return [0, 0, 0, color.alpha];
    case 'mix': {
      const p = color.pct / 100;
      const a = premultiplied(color.a);
      const b = premultiplied(color.b);
      return [
        a[0] * p + b[0] * (1 - p),
        a[1] * p + b[1] * (1 - p),
        a[2] * p + b[2] * (1 - p),
        a[3] * p + b[3] * (1 - p),
      ];
    }
    default:
      return unknownColor(color);
  }
}

/** Skia's float colour (unpremultiplied RGBA) at `opacity`. */
export function skiaColor(color: DrawColor, opacity = 1): Float32Array {
  const [r, g, b, a] = premultiplied(color);
  return a > 0
    ? new Float32Array([r / a, g / a, b / a, a * opacity])
    : new Float32Array([0, 0, 0, 0]);
}
