import { expect, it } from 'vitest';

import { posterFrame } from './poster';

const scenes = [{ spec: { id: 'turn' }, from: 100, durationInFrames: 101 }];
it('places the poster within the named scene', () => {
  expect(posterFrame(scenes, { scene: 'turn', at: 0.85 })).toBe(185);
  expect(posterFrame(scenes, { scene: 'turn', at: 0 })).toBe(100);
  expect(posterFrame(scenes, { scene: 'turn', at: 1 })).toBe(200);
});
it('rejects unknown scenes and invalid fractions or durations', () => {
  for (const at of [-1, 2, NaN])
    expect(() => posterFrame(scenes, { scene: 'turn', at })).toThrow();
  expect(() => posterFrame(scenes, { scene: 'missing', at: 0 })).toThrow();
  expect(() =>
    posterFrame([{ spec: { id: 'turn' }, from: 0, durationInFrames: 0 }], {
      scene: 'turn',
      at: 0,
    }),
  ).toThrow();
});
