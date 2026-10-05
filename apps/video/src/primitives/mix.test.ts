import { describe, expect, it } from 'vitest';

import { musicVolume } from './mix';

const options = {
  base: 0.3,
  ducked: 0.1,
  attack: 10,
  release: 10,
  fadeIn: 20,
  fadeOut: 40,
  durationInFrames: 400,
};
const voice = [{ from: 100, durationInFrames: 50 }];

describe('musicVolume', () => {
  it('fades in from silence', () => {
    expect(musicVolume(0, voice, options)).toBe(0);
    expect(musicVolume(10, voice, options)).toBeCloseTo(0.15);
  });

  it('sits at the base level in pauses', () => {
    expect(musicVolume(50, voice, options)).toBeCloseTo(0.3);
  });

  it('ducks under narration with ramps either side', () => {
    expect(musicVolume(95, voice, options)).toBeCloseTo(0.2);
    expect(musicVolume(120, voice, options)).toBeCloseTo(0.1);
    expect(musicVolume(155, voice, options)).toBeCloseTo(0.2);
    expect(musicVolume(170, voice, options)).toBeCloseTo(0.3);
  });

  it('fades out at the end and never goes negative', () => {
    expect(musicVolume(380, voice, options)).toBeCloseTo(0.15);
    expect(musicVolume(420, voice, options)).toBe(0);
  });

  it('treats zero-length fades as no fade', () => {
    expect(
      musicVolume(0, [], { ...options, fadeIn: 0, fadeOut: 0 }),
    ).toBeCloseTo(0.3);
  });
});

it('uses a fast attack and slower release without jumps at speech boundaries', () => {
  const settings = { ...options, attack: 8, release: 24 };
  expect(musicVolume(96, voice, settings)).toBeCloseTo(0.2);
  expect(musicVolume(162, voice, settings)).toBeCloseTo(0.2);
  expect(musicVolume(100, voice, settings)).toBeCloseTo(0.1);
  expect(musicVolume(150, voice, settings)).toBeCloseTo(0.1);
  expect(musicVolume(174, voice, settings)).toBeCloseTo(0.3);
});
it('supports zero attack/release and overlapping recovery spans', () => {
  expect(
    musicVolume(100, voice, { ...options, attack: 0, release: 0 }),
  ).toBeCloseTo(0.1);
  expect(
    musicVolume(150, voice, { ...options, attack: 0, release: 0 }),
  ).toBeCloseTo(0.1);
  expect(
    musicVolume(156, [...voice, { from: 160, durationInFrames: 20 }], options),
  ).toBeCloseTo(0.18);
});
