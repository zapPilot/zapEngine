import { expect, it } from 'vitest';
import { loadTokens, MODES } from '../src/tokens.js';
type RGB = [number, number, number];
function color(value: string, background: RGB = [0, 0, 0]): RGB {
  if (value.startsWith('#'))
    return [1, 3, 5].map(
      (start) => parseInt(value.slice(start, start + 2), 16) / 255,
    ) as RGB;
  const [r, g, b, alpha] = value.match(/[\d.]+/g)!.map(Number);
  return [r!, g!, b!].map(
    (channel, index) =>
      (channel / 255) * alpha! + background[index]! * (1 - alpha!),
  ) as RGB;
}
function luminance(rgb: RGB): number {
  return rgb
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, index) => sum + v * [0.2126, 0.7152, 0.0722][index]!, 0);
}
function ratio(a: RGB, b: RGB): number {
  const values = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (values[1]! + 0.05) / (values[0]! + 0.05);
}
it('keeps text readable on surfaces and composited semantic washes', () => {
  const tokens = loadTokens();
  for (const mode of MODES) {
    const roles = tokens.mode[mode];
    for (const surface of ['ground', 'sheet', 'well'] as const) {
      const base = color(roles[surface]);
      const backgrounds = [
        base,
        color(roles['sign-wash'], base),
        color(roles['alert-wash'], base),
      ];
      for (const foreground of [
        'ink',
        'ink-2',
        'ink-3',
        'sign-ink',
        'up',
        'down',
        'alert',
      ] as const) {
        for (const background of backgrounds)
          expect(
            ratio(color(roles[foreground]), background),
            `${mode}.${foreground} on ${surface}: ${background}`,
          ).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        ratio(color(roles.sign), base),
        `${mode}.sign on ${surface}`,
      ).toBeGreaterThanOrEqual(3);
    }
    expect(
      ratio(color(roles['on-sign']), color(roles.sign)),
    ).toBeGreaterThanOrEqual(4.5);
    // Primary controls darken sign by 8% on hover; native press uses opacity/scale.
    expect(
      ratio(
        color(roles['on-sign']),
        color('rgba(0,0,0,.08)', color(roles.sign)),
      ),
    ).toBeGreaterThanOrEqual(4.5);
  }
});
