import { describe, expect, it } from 'vitest';

import { musicVolume } from './mix';

const options = {
  base: 0.3,
  ducked: 0.1,
  ramp: 10,
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
