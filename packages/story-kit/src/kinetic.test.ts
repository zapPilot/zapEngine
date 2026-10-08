import { expect, it } from 'vitest';
import { kineticPoses, kineticText, parseKinetic } from './index.js';
it('ports kw masks, global stagger and all styles without hiding accessible text', () => {
  const lines = parseKinetic([
    ['Rules', 'decide.|o'],
    ['You|m', 'sign.|s'],
  ]);
  expect(kineticText(lines)).toBe('Rules decide. You sign.');
  expect(lines[1]!.words.map((w) => w.index)).toEqual([2, 3]);
  expect(kineticPoses(lines, 0)[0]![0]).toMatchObject({
    opacity: 0,
    translateY: 108,
  });
  expect(kineticPoses(lines, 0.08, true)[0]![0]).toMatchObject({
    opacity: 0.5,
    translateY: 54,
  });
  expect(
    kineticPoses(lines, 0.5, true)
      .flat()
      .every((w) => w.opacity === 1),
  ).toBe(true);
  expect(
    kineticPoses(lines, 1)
      .flat()
      .every((w) => w.opacity === 0),
  ).toBe(true);
  expect(
    kineticPoses(lines, 0.5, 1)
      .flat()
      .every((w) => w.translateY === -108),
  ).toBe(true);
  expect(
    kineticPoses(lines, 0.5, false)
      .flat()
      .every((w) => w.opacity === 1),
  ).toBe(true);
  expect(() => parseKinetic([['wrong|x']])).toThrow('Unknown kinetic style');
});
