import type { Sleeve } from '../scenes/AssetGlyph.js';
import {
  worldLength,
  wireBorder,
  lineBorder,
  labelStem,
  cameraProgress,
} from './geometry.js';
import { engineDecision } from '../facts/decision.js';
const decision = engineDecision();
interface FaceInput {
  w: number;
  h: number;
  tf: string;
  bg?: string;
  bd?: string;
  rad?: string;
  op?: number;
  sh?: string;
  fg?: string;
  fs?: number;
  fw?: number;
  pad?: string;
  ta?: string;
  mask?: string;
  text?: string;
  glyph?: Sleeve;
  clip?: string;
}
interface BoxInput {
  op?: number;
  wire?: boolean;
  bw?: string;
  wc?: string;
  sh?: string;
  top?: string;
  front?: string;
  left?: string;
  rad?: string;
  tfg?: string;
  tfs?: number;
  tfw?: number;
  tpad?: string;
  tta?: string;
  ttext?: string;
  ffg?: string;
  ffs?: number;
  ffw?: number;
  fpad?: string;
  ftext?: string;
}
interface PinInput {
  op: number;
  asset?: Sleeve;
  g?: string;
  tone?: string;
  stem?: number;
}
export interface EngineFace {
  w: string;
  h: string;
  tf: string;
  bg: string;
  bd: string;
  rad: string;
  op: string;
  sh: string;
  fg: string;
  fs: string;
  fw: number;
  pad: string;
  ta: string;
  mask: string;
  text: string;
  glyph?: Sleeve;
  clip: string;
}
export interface EnginePin {
  asset?: Sleeve;
  tf: string;
  op: string;
  t: string;
  s: string;
  g: string;
  cls: string;
  stem: string;
  fs: string;
}
export interface EngineTag {
  tf: string;
  op: string;
  n: string;
  t: string;
  s: string;
  cls: string;
  fs: string;
}
export interface EngineDot {
  tf: string;
  sz: string;
  bg: string;
  op: string;
}
/** Camera and solid/wireframe geometry transcribed from Landing v3 — Motion. */
class EngineModel {
  cl(v: number, a = 0, b = 1) {
    return v < a ? a : v > b ? b : v;
  }

  io(x: number) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  lerp(a: number, b: number, k: number) {
    return a + (b - a) * k;
  }

  sgn(v: number) {
    return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2) + '%';
  }

  camAt(t: number) {
    const K = [
      [0, 57, -34, 0.78, -13, -3, 4],
      [0.08, 56, -36, 0.84, -9, -3, 4],
      [0.11, 56, -37, 0.85, -9.5, -4, 4.5],
      [0.17, 50, -38, 1.2, -18, -29, 8],
      [0.26, 51, -41, 1.28, -17, -28, 8],
      [0.32, 54, -40, 1.55, -12, -21, 8],
      [0.41, 55, -43, 1.6, -12, -21, 8.5],
      [0.46, 55, -44, 1.4, -4, -15, 5],
      [0.53, 56, -46, 1.42, -3.5, -15, 5],
      [0.57, 56, -46, 1.45, 3, -11, 3],
      [0.61, 57, -47, 1.4, 3.5, -9, 3],
      [0.68, 57, -48, 1.15, 5, 6, 2],
      [0.76, 57, -46, 1.2, 5, 8, 2],
      [0.82, 56, -44, 1.35, 5, 17, 2],
      [0.89, 56, -42, 1.4, 5, 17.5, 2],
      [0.95, 56, -36, 0.86, -9, -3, 4],
      [1, 56, -35, 0.86, -9, -3, 4],
    ];
    let a = K[0]!;
    let b = K[K.length - 1]!;
    for (let i = 0; i < K.length - 1; i++) {
      if (t <= K[i + 1]![0]!) {
        a = K[i]!;
        b = K[i + 1]!;
        break;
      }
    }
    const k = cameraProgress(t, a[0]!, b[0]!);
    const L = this.lerp;
    return {
      ax: L(a[1]!, b[1]!, k),
      az: L(a[2]!, b[2]!, k),
      s: L(a[3]!, b[3]!, k),
      cx: L(a[4]!, b[4]!, k),
      cy: L(a[5]!, b[5]!, k),
      cz: L(a[6]!, b[6]!, k),
    };
  }

  batchY(c: number) {
    const P = [
      [0, -1],
      [0.18, 2],
      [0.26, 2],
      [0.44, 5.5],
      [0.52, 5.5],
      [0.7, 9],
      [0.78, 9],
      [1, 14.6],
    ];
    if (c >= 1) {
      return 14.6;
    }
    if (c <= 0) {
      return -1;
    }
    const i = P.findIndex((point, index) => index > 0 && c <= point[0]!);
    const a = P[i - 1]!;
    const b = P[i]!;
    return a[1]! + (b[1]! - a[1]!) * this.io((c - a[0]!) / (b[0]! - a[0]!));
  }

  // The runtime as a physical model. World units: x across, y toward the viewer, z up.
  eng(t: number, amb: number, narrow: boolean) {
    const C = {
      cl: this.cl.bind(this),
      io: this.io.bind(this),
      lerp: this.lerp.bind(this),
      batchY: this.batchY.bind(this),
      sgn: this.sgn.bind(this),
    };
    const F: EngineFace[] = [];
    const L: EnginePin[] = [];
    const G: EngineTag[] = [];
    const D: EngineDot[] = [];
    const cam = this.camAt(t);
    const lfs = 'clamp(10px, calc(.95 * var(--zp-u)), 15px)';
    const bb =
      ' rotateZ(' +
      (-cam.az).toFixed(2) +
      'deg) rotateX(' +
      (-cam.ax).toFixed(2) +
      'deg) scale(' +
      (1 / cam.s).toFixed(4) +
      ')';
    const lengths = new Map<number, string>();
    const px = (units: number) => {
      const cached = lengths.get(units);
      if (cached !== undefined) return cached;
      const value = worldLength(units);
      lengths.set(units, value);
      return value;
    };
    const T3 = function (x: number, y: number, z: number) {
      return 'translate3d(' + px(x) + ',' + px(y) + ',' + px(z) + ')';
    };
    const sg = function (a: number, b: number) {
      return C.cl((t - a) / (b - a));
    };
    const ez = function (x: number) {
      return C.io(x);
    };
    const face = function (o: FaceInput) {
      F.push({
        w: px(o.w),
        h: px(o.h),
        tf: o.tf,
        bg: o.bg || 'transparent',
        bd: o.bd || '0px none transparent',
        rad: o.rad || '0px',
        op: (o.op === undefined ? 1 : o.op).toFixed(3),
        sh: o.sh || 'none',
        fg: o.fg || 'var(--ink-3)',
        fs: px(o.fs || 0.6),
        fw: o.fw || 500,
        pad: o.pad || '0px',
        ta: o.ta || 'left',
        mask: o.mask || 'none',
        text: o.text || '',
        glyph: o.glyph,
        clip: o.clip || 'none',
      });
    };
    const box = function (
      x: number,
      y: number,
      z: number,
      w: number,
      d: number,
      h: number,
      o: BoxInput,
    ) {
      const op = o.op === undefined ? 1 : o.op;
      if (op < 0.004) {
        return;
      }
      const leftFace = {
        w: d,
        h,
        tf: T3(x, y, z + h) + ' rotateZ(90deg) rotateX(-90deg)',
        op,
      };
      if (o.wire) {
        const bd = wireBorder(o.bw, o.wc);
        face({ w: w, h: d, tf: T3(x, y, z + h), bd: bd, op: op });
        face({
          w: w,
          h: h,
          tf: T3(x, y + d, z + h) + ' rotateX(-90deg)',
          bd: bd,
          op: op,
        });
        face({
          w: w,
          h: h,
          tf: T3(x, y, z + h) + ' rotateX(-90deg)',
          bd: bd,
          op: op * 0.55,
        });
        face({
          ...leftFace,
          bd: bd,
        });
        face({
          w: d,
          h: h,
          tf: T3(x + w, y, z + h) + ' rotateZ(90deg) rotateX(-90deg)',
          bd: bd,
          op: op * 0.55,
        });
        return;
      }
      const sh = o.sh || 'inset 0 0 0 1px var(--material-edge)';
      face({
        w: w,
        h: d,
        tf: T3(x, y, z + h),
        bg: o.top || 'var(--material-top)',
        op: op,
        sh: sh,
        rad: o.rad,
        fg: o.tfg,
        fs: o.tfs,
        fw: o.tfw,
        pad: o.tpad,
        ta: o.tta,
        text: o.ttext,
      });
      if (h > 0.02) {
        face({
          w: w,
          h: h,
          tf: T3(x, y + d, z + h) + ' rotateX(-90deg)',
          bg: o.front || 'var(--material-front)',
          op: op,
          sh: sh,
          fg: o.ffg,
          fs: o.ffs,
          fw: o.ffw,
          pad: o.fpad,
          text: o.ftext,
        });
        face({
          ...leftFace,
          bg: o.left || 'var(--material-left)',
          sh: sh,
        });
      }
    };
    const sleeveHeight = (pct: number) =>
      1.8 + 7.4 * Math.sqrt(Math.max(0, pct) / 100);
    const assetModel = (
      asset: Sleeve,
      x: number,
      y: number,
      z: number,
      height: number,
      op: number,
    ) => {
      if (op < 0.004) return;
      const color = `var(--sleeve-${asset})`;
      const material = {
        op,
        front: color,
        top: `linear-gradient(135deg, color-mix(in srgb, ${color} 65%, var(--material-top)), ${color})`,
        left: `color-mix(in srgb, ${color} 72%, var(--material-ink-left))`,
      };
      face({
        w: 4,
        h: 4,
        tf: T3(x - 0.8, y - 0.8, z + 0.01),
        bg: 'radial-gradient(closest-side, var(--material-shadow), transparent)',
        op: op * 0.7,
      });
      if (asset === 'spy') {
        [0.55, 1, 0.72].forEach((scale, i) =>
          box(
            x + i * 0.8,
            y,
            z,
            0.7,
            2.4,
            Math.max(0.15, height * scale),
            material,
          ),
        );
      } else if (asset === 'eth') {
        const equator = [
          [x, y],
          [x + 2.4, y],
          [x + 2.4, y + 2.4],
          [x, y + 2.4],
        ];
        const slant = Math.hypot(height / 2, 1.2);
        const tilt = (Math.atan2(height / 2, 1.2) * 180) / Math.PI;
        equator.forEach(([sx, sy], side) => {
          for (const direction of [-1, 1]) {
            face({
              w: 2.4,
              h: slant,
              tf:
                T3(sx!, sy!, z + height / 2) +
                ` rotateZ(${side * 90}deg) rotateX(${(tilt * direction).toFixed(4)}deg)`,
              bg: direction > 0 ? material.top : material.left,
              clip: 'polygon(0 0, 100% 0, 50% 100%)',
              op,
            });
          }
        });
      } else {
        const layers = 1;
        const sides = asset === 'btc' ? 6 : 12;
        for (let layer = 0; layer < layers; layer++) {
          const base = z + (height * layer) / layers;
          const thickness = Math.max(0.04, height / layers - 0.04);
          for (let side = 0; side < sides; side++) {
            const angle = (side * Math.PI * 2) / sides;
            const next = ((side + 1) * Math.PI * 2) / sides;
            const dx = Math.cos(next) - Math.cos(angle);
            const dy = Math.sin(next) - Math.sin(angle);
            face({
              w: Math.hypot(dx, dy) * 1.2,
              h: thickness,
              tf:
                T3(
                  x + 1.2 + Math.cos(angle) * 1.2,
                  y + 1.2 + Math.sin(angle) * 1.2,
                  base + thickness,
                ) +
                ` rotateZ(${((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(4)}deg) rotateX(-90deg)`,
              bg:
                asset === 'stable'
                  ? `repeating-linear-gradient(to bottom, var(--material-edge) 0 1px, transparent 1px calc(${height / 6} * var(--zp-u))), ${side % 2 ? material.left : material.front}`
                  : side % 2
                    ? material.left
                    : material.front,
              op,
            });
          }
          face({
            w: 2.4,
            h: 2.4,
            tf: T3(x, y, base + thickness),
            bg: material.top,
            clip:
              asset === 'btc'
                ? 'polygon(100% 50%, 75% 93.3%, 25% 93.3%, 0 50%, 25% 6.7%, 75% 6.7%)'
                : 'circle(50%)',
            op,
          });
        }
      }
      face({
        w: 2.4,
        h: 2.4,
        tf: T3(x, y, z + height + 0.06),
        fg: 'var(--ink)',
        glyph: asset,
        op,
      });
    };
    const line3 = function (
      p: number[],
      q: number[],
      col: string,
      op: number,
      style = 'solid',
    ) {
      if (op < 0.004) {
        return;
      }
      const dx = q[0]! - p[0]!;
      const dy = q[1]! - p[1]!;
      const dz = q[2]! - p[2]!;
      const hl = Math.sqrt(dx * dx + dy * dy);
      const len = Math.sqrt(hl * hl + dz * dz);
      const phi = (Math.atan2(dy, dx) * 180) / Math.PI;
      const th = (Math.atan2(dz, hl) * 180) / Math.PI;
      face({
        w: len,
        h: 0,
        tf:
          T3(p[0]!, p[1]!, p[2]!) +
          ' rotateZ(' +
          phi.toFixed(2) +
          'deg) rotateY(' +
          (-th).toFixed(2) +
          'deg)',
        bd: lineBorder(col, style),
        op: op,
      });
    };
    const dot = function (p: number[], sz: number, bg: string, op: number) {
      if (op < 0.01) {
        return;
      }
      D.push({
        tf: T3(p[0]!, p[1]!, p[2]!) + bb + ' translate(-50%,-50%)',
        sz: sz + 'px',
        bg: bg,
        op: op.toFixed(3),
      });
    };
    const pin = function (
      p: number[],
      title: string,
      sub: string,
      o: PinInput,
    ) {
      if (o.op < 0.01) {
        return;
      }
      L.push({
        asset: o.asset,
        tf: T3(p[0]!, p[1]!, p[2]!) + bb + ' translate(-50%,-100%)',
        op: o.op.toFixed(3),
        t: title,
        s: sub || '',
        g: o.g || 'st-none',
        cls: 'blb-box ' + (o.tone || ''),
        stem: labelStem(o.stem),
        fs: lfs,
      });
    };
    const tag = function (
      p: number[],
      n: string,
      name: string,
      state: string,
      o: PinInput,
    ) {
      if (o.op < 0.01) {
        return;
      }
      G.push({
        tf: T3(p[0]!, p[1]!, p[2]!) + bb + ' translate(-100%,-50%)',
        op: o.op.toFixed(3),
        n: n,
        t: name,
        s: state,
        cls: 'tag-box ' + (o.tone || ''),
        fs: lfs,
      });
    };

    const a1 = ez(sg(0, 0.05));
    const a2 = ez(sg(0.015, 0.06));
    const a3 = ez(sg(0.03, 0.07));
    const a4 = ez(sg(0.04, 0.08));
    const obs = sg(0.11, 0.26);
    const fire = ez(sg(0.29, 0.35));
    const tgt = ez(sg(0.43, 0.51));
    const chk = sg(0.61, 0.76);
    const sgn = sg(0.76, 0.89);
    const own = ez(sg(0.89, 0.96));
    const bob = Math.sin(amb * 2.1);
    const flo = 1 - a1;
    const bz = flo * (9 + bob * 0.35);
    const top = bz + 1.6;
    const ink = 'var(--ink)';

    // floor: grid, hosted zone, your side, the wallet boundary
    const g4 = px(4) + ' ' + px(4);
    face({
      w: 140,
      h: 116,
      tf: T3(-76, -56, 0),
      bg:
        'linear-gradient(var(--material-floor) 1px, transparent 1px) 0 0 / ' +
        g4 +
        ', linear-gradient(90deg, var(--material-floor) 1px, transparent 1px) 0 0 / ' +
        g4,
      mask: 'radial-gradient(closest-side, #000 35%, transparent)',
    });
    face({
      w: 50,
      h: 46.4,
      tf: T3(-33, -31, 0.03),
      bd: '1px solid var(--rule-2)',
      rad: '3px',
      op: 0.8,
    });
    face({
      w: 120,
      h: 40,
      tf: T3(-66, 16.1, 0.05),
      bg: 'var(--sign-wash)',
      mask: 'radial-gradient(farthest-side at 50% 0%, #000 45%, transparent)',
    });
    face({
      w: 120,
      h: 0.3,
      tf: T3(-66, 15.85, 0.12),
      bg: 'var(--sign)',
      mask: 'linear-gradient(90deg, transparent, #000 25%, #000 75%, transparent)',
    });
    face({
      w: 28,
      h: 1.4,
      tf: T3(-32, 13.6, 0.14),
      fg: 'var(--ink-3)',
      fs: 0.8,
      fw: 600,
      text: 'HOSTED BY ZAP PILOT · TODAY',
    });
    face({
      w: 16,
      h: 1.4,
      tf: T3(17, 14.2, 0.14),
      fg: 'var(--sign-ink)',
      fs: 0.8,
      fw: 600,
      text: 'WALLET BOUNDARY',
    });
    face({
      w: 16,
      h: 1.4,
      tf: T3(17, 16.6, 0.14),
      fg: 'var(--sign-ink)',
      fs: 0.8,
      fw: 600,
      text: 'YOUR SIDE',
    });
    face({
      w: 54,
      h: 36,
      tf: T3(-35, -33, 0.07),
      bg: 'radial-gradient(closest-side, var(--material-shadow), transparent)',
      op: 1 - flo * 0.55,
    });

    // the runtime board
    box(-30, -28, bz, 44, 26, 1.6, {
      ftext: 'ZAP PILOT · PORTFOLIO RUNTIME',
      ffs: 0.62,
      ffg: 'var(--ink-3)',
      ffw: 600,
      fpad: px(0.45) + ' ' + px(1.2),
    });
    face({
      w: 42,
      h: 24,
      tf: T3(-29, -27, top + 0.02),
      bd: '1px solid var(--material-edge)',
      rad: '2px',
    });
    face({
      w: 10,
      h: 13,
      tf: T3(-28, -24, top + 0.03),
      bd: '1.5px dashed var(--rule-2)',
      op: 1 - a2,
    });

    // your strategy: a cartridge that docks into the board
    const cz = top + (1 - a2) * (14 + bob * 0.4);
    box(-28, -24, cz, 10, 13, 1.2, {
      ttext:
        'STRATEGY\nDMA/FGI RULES\n\n1 CROSS-DOWN EXIT\n2 CROSS-UP\n3 RATIO ROTATION\n4 RATIO DCA\n5 OVEREXTENSION\n6 FGI DOWNSHIFT',
      tfs: 0.6,
      tfg: 'var(--ink-2)',
      tfw: 500,
      tpad: px(0.8),
      ftext: 'YOUR STRATEGY',
      ffs: 0.5,
      ffg: 'var(--ink-3)',
      fpad: px(0.3) + ' ' + px(0.6),
    });

    // rule engine: a spindle with six plates, evaluated top-down
    box(-11, -21, top, 1, 1, 13, { top: ink });
    const RN = [
      'CROSS-DOWN EXIT',
      'CROSS-UP',
      'RATIO ROTATION',
      'RATIO DCA',
      'OVEREXTENSION',
      'FGI DOWNSHIFT',
    ];
    const RT = [
      'Cross-down exit',
      'Cross-up',
      'Ratio rotation',
      'Ratio DCA',
      'Overextension',
      'FGI downshift',
    ];
    const tagOp = sg(0.265, 0.29) * (1 - sg(0.41, 0.44));
    for (let i = 1; i <= 6; i++) {
      const f1 = i === 1 ? fire : 0;
      const pz = top + 1.4 + (6 - i) * 1.7 + flo * (7 - i) * 1.6 + f1 * 2.2;
      const dim = i === 1 ? 1 : 1 - 0.55 * fire * (1 - own);
      const mx = (f1 * 100).toFixed(0);
      box(-14, -24, pz, 7, 7, 0.7, {
        op: dim,
        top:
          f1 > 0.01
            ? 'color-mix(in srgb, var(--ink) ' + mx + '%, var(--material-top))'
            : 'var(--material-top)',
        front:
          f1 > 0.01
            ? 'color-mix(in srgb, var(--ink) ' +
              mx +
              '%, var(--material-front))'
            : 'var(--material-front)',
        left:
          f1 > 0.01
            ? 'color-mix(in srgb, var(--ink) ' + mx + '%, var(--material-left))'
            : 'var(--material-left)',
        ttext: i === 1 && f1 > 0.5 ? 'RULE 1 · FIRED' : i + '  ' + RN[i - 1]!,
        tfs: 0.56,
        tfg: i === 1 && f1 > 0.5 ? 'var(--ground)' : 'var(--ink-2)',
        tfw: 600,
        tpad: px(0.5) + ' ' + px(0.6),
      });
      face({
        w: 1.1,
        h: 1.1,
        tf: T3(-8.5, -18.8, pz + 0.73),
        text: ['↘', '↗', '⇄', '∶', '↑', '↓'][i - 1]!,
        fs: 0.95,
        fg: i === 1 && f1 > 0.5 ? 'var(--ground)' : 'var(--ink)',
        op: dim,
      });
      const stt = fire > 0.5 ? (i === 1 ? 'fired' : 'skipped') : '';
      tag([-14, -17, pz + 0.35], String(i), RT[i - 1]!, stt, {
        op: tagOp * (i === 1 ? 1 : 1 - 0.45 * fire),
        tone: i === 1 && fire > 0.5 ? 'ink' : '',
      });
    }

    // observe: market data streams into the top of the stack
    const bo = sg(0.105, 0.14) * (1 - 0.75 * sg(0.27, 0.32));
    const hub = [-10.5, -20.5, top + 13];
    const SRC: [string, number, number, number, string][] = [
      ['SPY', -26, -40, 8, C.sgn(decision.dmaDistance['SPY']!)],
      ['BTC', -18, -42, 9.5, C.sgn(decision.dmaDistance['BTC']!)],
      ['ETH', -10, -41, 8.5, C.sgn(decision.dmaDistance['ETH']!)],
      ['FEAR & GREED', -2, -39, 7.5, ''],
    ];
    const lop = sg(0.12, 0.15) * (1 - sg(0.255, 0.28));
    for (let k = 0; k < 4; k++) {
      const s0 = SRC[k]!;
      const hot = k === 1;
      const p0 = [s0[1]!, s0[2]!, s0[3]!];
      if (k < 3) {
        assetModel(
          (['spy', 'btc', 'eth'] as const)[k]!,
          s0[1]! - 1.2,
          s0[2]! - 1.2,
          s0[3]! - 0.45,
          2.4,
          bo * sg(0.105 + k * 0.009, 0.14 + k * 0.009),
        );
      } else {
        box(s0[1]! - 1.1, s0[2]! - 1.1, s0[3]! - 0.45, 2.2, 2.2, 0.9, {
          op: bo,
        });
      }
      line3(p0, hub, hot ? ink : 'var(--ink-3)', bo * (hot ? 1 : 0.6));
      for (let j = 0; j < 3; j++) {
        const fr = (((amb * 0.32 + obs * 1.4 + j / 3 + k * 0.17) % 1) + 1) % 1;
        dot(
          [
            C.lerp(p0[0]!, hub[0]!, fr),
            C.lerp(p0[1]!, hub[1]!, fr),
            C.lerp(p0[2]!, hub[2]!, fr),
          ],
          hot ? 7 : 5,
          hot ? ink : 'var(--ink-3)',
          bo * Math.sin(Math.PI * fr),
        );
      }
      pin([s0[1]!, s0[2]!, s0[3]! + 0.6], s0[0]!, s0[4]!, {
        op: lop,
        tone: hot ? 'ink' : '',
        stem: k === 3 ? 3.6 : 1.4,
      });
    }

    // target: a gauge for stables and four sleeve columns, held -> target
    const stable = C.lerp(decision.held[3]!, decision.target[3]!, tgt);
    box(-17.4, -5.4, top, 9.8, 1.6, 0.6, {});
    const dial = {
      w: px(9),
      h: px(8),
      tf: T3(-17, -8.59, top + 6.55) + ' rotateX(-55deg)',
      ang: (-135 + 2.7 * stable).toFixed(2),
      val: stable.toFixed(2) + '%',
    };
    const HELD = decision.held;
    const TG = decision.target;
    const SL = ['btc', 'eth', 'spy', 'stable'];
    const heldOp = sg(0.42, 0.45) * (1 - sg(0.55, 0.6));
    for (let m = 0; m < 4; m++) {
      const pct = C.lerp(HELD[m]!, TG[m]!, tgt);
      assetModel(
        SL[m]! as Sleeve,
        -3 + m * 3,
        -25.4,
        top,
        sleeveHeight(pct),
        1,
      );
      pin(
        [
          -1.8 + m * 3,
          -24.2,
          top + sleeveHeight(pct) + 1.1 + (m < 3 ? m * 1.5 : 0),
        ],
        SL[m]!.toUpperCase(),
        pct.toFixed(2) + '%',
        {
          asset: SL[m]! as Sleeve,
          op: (pct < 0.5 ? 0 : 1) * sg(0.425, 0.455) * (1 - sg(0.53, 0.56)),
          stem: 0.7 + (m < 3 ? m * 1.5 : 0),
        },
      );
      face({
        w: 2.4,
        h: 2.4,
        tf: T3(-3 + m * 3, -25.4, top + sleeveHeight(HELD[m]!) + 0.02),
        bd: '1.5px dashed var(--ink-2)',
        op: heldOp,
      });
    }
    pin([2.7, -24.2, top + 11.2], 'TARGET', '', {
      op: sg(0.425, 0.455) * (1 - sg(0.53, 0.56)),
      g: 'st-live',
      stem: 1.4,
    });

    // plan: a wireframe tray, because rebalance plans are not built yet
    const pf = sg(0.525, 0.555) * (1 - sg(0.605, 0.635));
    const po = 0.5 + 0.5 * Math.max(pf, own);
    box(0, -17, top, 9, 7, 3, { wire: true, op: po * a1, wc: 'var(--ink-3)' });
    for (let n = 0; n < 3; n++) {
      const gtx = own > 0 ? 1 : C.cl((t - 0.535 - n * 0.012) / 0.02);
      face({
        w: 7 - n * 0.9,
        h: 1.5,
        tf: T3(1, -16 + n * 2.1, top + 0.9 + n * 0.7),
        bd: '1.5px dashed var(--ink-3)',
        rad: '2px',
        op: Math.max(pf, own * 0.6) * gtx,
      });
    }
    pin([4.5, -13.5, top + 3], 'REBALANCE PLANS', 'not built yet', {
      op: pf,
      g: 'st-plan',
      tone: 'plan',
      stem: 1.6,
    });
    box(4.2, -4.8, top, 3, 2.8, 1.1, {
      ttext: 'OUT',
      tfs: 0.6,
      tfg: 'var(--ink-2)',
      tfw: 600,
      tpad: px(0.6) + ' ' + px(0.7),
    });

    // check: the deposit batch rides the cable through three live gates and one planned one
    const by = C.batchY(chk);
    const bAp = ez(C.cl(chk / 0.05));
    const signedK = ez(C.cl((sgn - 0.62) / 0.26));
    const press =
      ez(C.cl((sgn - 0.53) / 0.06)) * (1 - ez(C.cl((sgn - 0.62) / 0.08)));
    face({
      w: 1,
      h: 17.8,
      tf: T3(5.2, -2, 0.08),
      bg: 'var(--material-front)',
      sh: 'inset 0 0 0 1px var(--material-edge)',
      op: a1,
    });
    if (chk > 0) {
      face({
        w: 0.36,
        h: Math.max(0.01, by + 2),
        tf: T3(5.52, -2, 0.1),
        bg: ink,
        op: a1 * (1 - own * 0.5),
      });
    }
    face({
      w: 1,
      h: 3.4,
      tf: T3(5.2, 16.1, 0.08),
      bd: '1.5px ' + (signedK > 0.02 ? 'solid' : 'dashed') + ' var(--sign)',
      bg: signedK > 0.02 ? 'var(--sign-wash)' : 'transparent',
      op: a3,
    });
    const GY = [2, 5.5, 9, 12.5];
    const GN = ['APPROVAL CAPPED', 'MINIMUM RECEIVED', 'SIMULATED'];
    const GS = ['◇', '⊥', '✓'];
    const GP = [
      [0.15, 0.3],
      [0.41, 0.56],
      [0.67, 0.82],
    ];
    for (let gi = 0; gi < 4; gi++) {
      const live = gi < 3;
      const lit = live && chk > 0 && by >= GY[gi]! - 0.06;
      const near = lit && Math.abs(by - GY[gi]!) < 1.2;
      face({
        w: 5,
        h: 4.2,
        tf: T3(3.2, GY[gi]!, 4.2) + ' rotateX(-90deg)',
        bd:
          px(0.3) +
          (live ? ' solid ' : ' dashed ') +
          (lit ? ink : live ? 'var(--material-left)' : 'var(--ink-3)'),
        rad: px(0.5) + ' ' + px(0.5) + ' 0 0',
        bg: near
          ? 'color-mix(in srgb, var(--ink) 9%, transparent)'
          : 'transparent',
        op: a1,
      });
      if (live) {
        const gop =
          chk > 0
            ? C.cl((chk - GP[gi]![0]!) / 0.03) *
              (1 - C.cl((chk - GP[gi]![1]!) / 0.04))
            : 0;
        pin([5.7, GY[gi]!, 4.4], GN[gi]!, GS[gi]!, {
          op: gop,
          g: lit ? 'st-live' : 'st-none',
          stem: 1.3,
        });
      }
    }
    pin([5.7, 12.5, 4.4], 'YOUR POLICY', 'planned', {
      op: C.cl((chk - 0.86) / 0.04) * (1 - sg(0.785, 0.805)),
      g: 'st-plan',
      tone: 'plan',
      stem: 1.3,
    });

    const waiting = chk >= 1 && signedK <= 0;
    const bob2 = waiting ? 0.25 + 0.25 * Math.sin(amb * 3.1) : 0;
    const byy = C.lerp(by, 18.3, signedK);
    const bsz = 2.2 * (1 - 0.65 * C.cl((signedK - 0.6) / 0.4));
    const bop = bAp * (1 - C.cl((signedK - 0.75) / 0.25));
    const sk = (ez(C.cl((sgn - 0.56) / 0.06)) * 100).toFixed(0);
    box(5.7 - bsz / 2, byy - bsz / 2, 0.15 + bob2, bsz, bsz, bsz, {
      op: bop,
      sh: 'none',
      top:
        'color-mix(in srgb, var(--sign) ' + sk + '%, var(--material-ink-top))',
      front:
        'color-mix(in srgb, var(--sign) ' +
        sk +
        '%, var(--material-ink-front))',
      left:
        'color-mix(in srgb, var(--sign) ' + sk + '%, var(--material-ink-left))',
    });
    const bpo =
      t < 0.76
        ? C.cl((chk - 0.03) / 0.03) * (1 - C.cl((chk - 0.13) / 0.03))
        : sg(0.765, 0.79) * (1 - sg(0.885, 0.9));
    const pre = sgn < 0.56;
    pin(
      [5.7, byy, 0.15 + bob2 + bsz + 0.3],
      t < 0.76
        ? 'DEPOSIT BATCH'
        : pre
          ? 'AWAITING YOUR SIGNATURE'
          : 'SIGNED IN YOUR WALLET',
      t < 0.76 ? 'approve + deposit' : '',
      {
        op: bop * bpo + (pre ? 0 : (1 - bop) * bpo),
        tone: t < 0.76 ? '' : 'sign',
        g: pre ? 'st-none' : 'st-live',
        stem: 1.6,
      },
    );

    // your wallet: the only thing that can move the batch
    const kz = (1 - a3) * (12 + bob * 0.5);
    face({
      w: 13,
      h: 10,
      tf: T3(-0.5, 17.5, 0.07),
      bg: 'radial-gradient(closest-side, var(--material-shadow), transparent)',
      op: 1 - (1 - a3) * 0.6,
    });
    box(1.5, 19.5, kz, 9, 6, 2.2, {
      ttext: 'YOUR WALLET',
      tfs: 0.72,
      tfg: ink,
      tfw: 600,
      tpad: px(0.75) + ' ' + px(0.85),
      ftext: 'SIGNS THE BATCH',
      ffs: 0.48,
      ffg: 'var(--ink-3)',
      fpad: px(0.5) + ' ' + px(0.85),
    });
    const glow =
      t >= 0.76 && t < 0.9
        ? sg(0.765, 0.8) * (0.5 + 0.5 * Math.sin(amb * 4.4)) * (1 - signedK)
        : 0;
    face({
      w: 2.8,
      h: 2.8,
      tf: T3(6.4, 22, kz + 2.2 + 0.3 - press * 0.22),
      bg: 'var(--sign)',
      rad: '50%',
      fg: 'var(--on-sign)',
      fs: 0.5,
      fw: 700,
      ta: 'center',
      pad: px(1.02) + ' 0px 0px',
      text: 'SIGN',
      sh:
        '0 0 0 ' +
        (2 + glow * 10).toFixed(1) +
        'px color-mix(in srgb, var(--sign) ' +
        (18 + glow * 24).toFixed(0) +
        '%, transparent), inset 0 -3px 0 rgba(0,0,0,.22)',
    });

    // your machine: planned, so it is drawn as a wireframe
    const go =
      a4 * (0.45 + 0.55 * Math.max(own, sg(0.04, 0.07) * (1 - sg(0.1, 0.13))));
    box(-25, 19, 0, 18, 10, 5, {
      wire: true,
      op: go * 0.75,
      wc: 'var(--ink-3)',
    });
    box(-23, 21, 0, 14, 6, 1.1, { wire: true, op: go, wc: 'var(--ink-3)' });
    box(-19.5, 22.5, 1.1, 2.6, 2.6, 2.4, {
      wire: true,
      op: go * 0.85,
      wc: 'var(--ink-3)',
    });
    face({
      w: 14,
      h: 1.4,
      tf: T3(-24.5, 29.4, 0.14),
      fg: 'var(--ink-3)',
      fs: 0.8,
      fw: 600,
      text: 'YOUR MACHINE',
      op: a4,
    });
    line3(
      [-30, -2, 0.16],
      [-17, 19, 0.16],
      'var(--ink-3)',
      own * 0.9,
      'dashed',
    );

    // the three parts, as they land
    const aout = 1 - sg(0.098, 0.115);
    pin([-23, -17.5, cz + 1.2], 'YOUR STRATEGY', 'readable rules', {
      op: sg(0.04, 0.06) * aout,
      g: 'st-live',
      stem: 2.1,
    });
    pin([-16, 24, 5.2], 'YOUR MACHINE', 'planned · hosted today', {
      op: sg(0.06, 0.08) * aout,
      g: 'st-plan',
      tone: 'plan',
      stem: 1.7,
    });
    pin([6, 22.5, kz + 2.6], 'YOUR WALLET', 'you sign', {
      op: sg(0.05, 0.07) * aout,
      g: 'st-live',
      tone: 'sign',
      stem: 1.7,
    });

    // status: solid runs today, wireframe does not yet
    pin([-6, -41, 10], 'MARKET DATA', '', { op: own, g: 'st-live', stem: 1.4 });
    pin([-23, -17.5, top + 1.2], 'STRATEGY', '', {
      op: own,
      g: 'st-live',
      stem: 2.1,
    });
    pin([-10.5, -20.5, top + 13], 'RULE ENGINE', '', {
      op: own,
      g: 'st-live',
      stem: 6.6,
    });
    pin([2.7, -24.2, top + 10.8], 'TARGET', '', {
      op: own,
      g: 'st-live',
      stem: 1.2,
    });
    pin([4.5, -13.5, top + 3], 'REBALANCE PLANS', '', {
      op: own,
      g: 'st-plan',
      tone: 'plan',
      stem: 2.1,
    });
    pin([5.7, 5.5, 4.4], 'PRE-SIGN CHECKS', '', {
      op: own,
      g: 'st-live',
      stem: 4.9,
    });
    pin([5.7, 12.5, 4.4], 'YOUR POLICY', '', {
      op: own,
      g: 'st-plan',
      tone: 'plan',
      stem: 1.6,
    });
    pin([6, 22.5, 2.6], 'WALLET SIGNING', '', {
      op: own,
      g: 'st-live',
      tone: 'sign',
      stem: 1.7,
    });
    pin([-16, 24, 5.2], 'YOUR MACHINE', '', {
      op: own,
      g: 'st-plan',
      tone: 'plan',
      stem: 1.7,
    });

    const camS =
      'scale(' +
      cam.s.toFixed(4) +
      ') rotateX(' +
      cam.ax.toFixed(2) +
      'deg) rotateZ(' +
      cam.az.toFixed(2) +
      'deg) translate3d(' +
      px(-cam.cx) +
      ',' +
      px(-cam.cy) +
      ',' +
      px(-cam.cz) +
      ')';
    return {
      cam: camS,
      faces: F,
      labels: L,
      tags: G,
      dots: D,
      dial: dial,
      persp: px(187.5),
      ox: narrow ? '50%' : '62%',
      oy: narrow ? '66%' : '57%',
      po: narrow ? '50% 58%' : '62% 50%',
    };
  }
}
const model = new EngineModel();
export const engineScene = (time: number, ambient = 0, narrow = false) =>
  model.eng(model.cl(time), ambient, narrow);
