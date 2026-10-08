import { expect, it } from 'vitest';
import { loadTokens, MODES } from '../src/tokens.js';
type Triple = [number, number, number];
// Machado et al., 2009, full-severity matrices in linear sRGB:
// https://colour.readthedocs.io/en/latest/generated/colour.matrix_cvd_Machado2009.html
const matrices = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};
const radians = (degrees: number) => (degrees * Math.PI) / 180;
function lab(rgb: number[]): Triple {
  const xyz = [
    [0.4124564, 0.3575761, 0.1804375],
    [0.2126729, 0.7151522, 0.072175],
    [0.0193339, 0.119192, 0.9503041],
  ].map(
    (row, i) =>
      row.reduce((sum, value, j) => sum + value * rgb[j]!, 0) /
      [0.95047, 1, 1.08883][i]!,
  );
  const f = xyz.map((value) =>
    value > (6 / 29) ** 3
      ? Math.cbrt(value)
      : value / (3 * (6 / 29) ** 2) + 4 / 29,
  );
  return [116 * f[1]! - 16, 500 * (f[0]! - f[1]!), 200 * (f[1]! - f[2]!)];
}
// Sharma, Wu & Dalal, 2005. Implementation is checked against published vectors:
// https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/
function delta(a: Triple, b: Triple): number {
  const c1 = Math.hypot(a[1], a[2]),
    c2 = Math.hypot(b[1], b[2]);
  const c = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(c ** 7 / (c ** 7 + 25 ** 7)));
  const ap = [a[1] * (1 + g), b[1] * (1 + g)];
  const cp = [Math.hypot(ap[0]!, a[2]), Math.hypot(ap[1]!, b[2])];
  const hp = [a, b].map((v, i) =>
    cp[i] === 0 ? 0 : ((Math.atan2(v[2], ap[i]!) * 180) / Math.PI + 360) % 360,
  );
  const dl = b[0] - a[0],
    dc = cp[1]! - cp[0]!;
  let dh = hp[1]! - hp[0]!;
  if (cp[0]! * cp[1]! === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(cp[0]! * cp[1]!) * Math.sin(radians(dh / 2));
  const l = (a[0] + b[0]) / 2,
    cc = (cp[0]! + cp[1]!) / 2;
  const sum = hp[0]! + hp[1]!;
  const h =
    cp[0]! * cp[1]! === 0
      ? sum
      : Math.abs(hp[0]! - hp[1]!) <= 180
        ? sum / 2
        : (sum + (sum < 360 ? 360 : -360)) / 2;
  const t =
    1 -
    0.17 * Math.cos(radians(h - 30)) +
    0.24 * Math.cos(radians(2 * h)) +
    0.32 * Math.cos(radians(3 * h + 6)) -
    0.2 * Math.cos(radians(4 * h - 63));
  const sl = 1 + (0.015 * (l - 50) ** 2) / Math.sqrt(20 + (l - 50) ** 2),
    sc = 1 + 0.045 * cc,
    sh = 1 + 0.015 * cc * t;
  const rt =
    -2 *
    Math.sqrt(cc ** 7 / (cc ** 7 + 25 ** 7)) *
    Math.sin(radians(60 * Math.exp(-(((h - 275) / 25) ** 2))));
  return Math.sqrt(
    (dl / sl) ** 2 +
      (dc / sc) ** 2 +
      (dH / sh) ** 2 +
      rt * (dc / sc) * (dH / sh),
  );
}
it('matches independent CIEDE2000 reference vectors', () => {
  expect(delta([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(
    2.0425,
    4,
  );
  expect(delta([50, 3.1571, -77.2803], [50, 0, -82.7485])).toBeCloseTo(
    2.8615,
    4,
  );
});
it('separates all sleeves in normal vision and three CVD simulations with ordered lightness', () => {
  const tokens = loadTokens();
  for (const mode of MODES) {
    const colors = Object.values(tokens.sleeve[mode]).map((hex) =>
      [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)),
    );
    const normal = colors.map(lab);
    for (let i = 1; i < normal.length; i++)
      expect(
        normal[i]![0] - normal[i - 1]![0],
        `${mode} adjacent lightness`,
      ).toBeGreaterThanOrEqual(8);
    for (const [name, matrix] of [
      ['normal', undefined],
      ...Object.entries(matrices),
    ] as const) {
      const labs = matrix
        ? colors.map((color) =>
            lab(
              matrix.map((row) =>
                Math.max(
                  0,
                  Math.min(
                    1,
                    row.reduce((sum, value, i) => sum + value * color[i]!, 0),
                  ),
                ),
              ),
            ),
          )
        : normal;
      for (let a = 0; a < 5; a++)
        for (let b = a + 1; b < 5; b++)
          expect(
            delta(labs[a]!, labs[b]!),
            `${mode}.${name} sleeves ${a}/${b}`,
          ).toBeGreaterThanOrEqual(name === 'normal' ? 20 : 12);
    }
  }
});
