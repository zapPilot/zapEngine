import { expect, it } from 'vitest';

import {
  chroma,
  correlation,
  onsets,
  rms,
  sampleAt,
  seamMetrics,
  spectrum,
  tempo,
} from './dsp';

it('measures power and correlation, including silence and inversion', () => {
  expect(rms([])).toBe(0);
  expect(rms([1, -1])).toBe(1);
  expect(correlation([1, 2], [1, 2])).toBe(1);
  expect(correlation([1, 2], [-1, -2])).toBe(-1);
  expect(correlation([0, 0], [1, 2])).toBe(0);
  expect(() => correlation([], [1])).toThrow();
  expect(() => correlation([], [])).toThrow();
});
it('identifies a known FFT tone and its pitch class', () => {
  const rate = 8192,
    tone = Float64Array.from({ length: 8192 }, (_, i) =>
      Math.sin((2 * Math.PI * 440 * i) / rate),
    );
  const bins = spectrum(tone);
  expect(bins[440]).toBeCloseTo(4096, 5);
  expect(bins[100]).toBeCloseTo(0, 5);
  expect(chroma(bins, rate)[9]).toBeGreaterThan(4095);
  expect(
    chroma(
      Float64Array.from({ length: 8192 }, () => 1),
      48000,
    ).reduce((a, b) => a + b),
  ).toBeGreaterThan(0);
  for (const n of [0, 1, 3])
    expect(() => spectrum(new Float64Array(n))).toThrow();
});
it('detects onset flux and refines an impulse train around the supplied BPM', () => {
  const samples = Float64Array.from({ length: 8000 }, (_, i) =>
    i % 1000 < 100 ? Math.sin(i) : 0,
  );
  expect(onsets(samples).some((x) => x > 0)).toBe(true);
  expect(() => onsets(new Float64Array(10))).toThrow();
  expect(() => onsets(samples, 1024, 0)).toThrow();
  const train = Float64Array.from({ length: 2000 }, (_, i) =>
    i % 100 === 25 ? 1 : 0,
  );
  const result = tempo(train, 200, 120);
  expect(result.bpm).toBeCloseTo(120, 3);
  expect(result.phaseSeconds).toBeCloseTo(0.125, 3);
  expect(tempo(new Float64Array(2000), 200, 120).bpm).toBeGreaterThan(0);
  for (const args of [
    [new Float64Array(1), 200, 120],
    [train, 200, 0],
    [train, 200, 300],
    [train, 0, 120],
  ] as const)
    expect(() => tempo(args[0], args[1], args[2])).toThrow();
});

it('measures encoded head/tail seams and rejects missing/silent overlap', () => {
  const samples = new Float64Array(8192).fill(0.1);
  expect(seamMetrics(samples, 4096, 2048, 48000).rho).toBeCloseTo(1);
  for (const [period, crossfade] of [
    [0, 2048],
    [4096, 10],
    [8192, 2048],
  ])
    expect(() => seamMetrics(samples, period!, crossfade!, 48000)).toThrow();
  expect(() =>
    seamMetrics(new Float64Array(8192), 4096, 2048, 48000),
  ).toThrow();
  samples.fill(0, 4096);
  expect(() => seamMetrics(samples, 4096, 2048, 48000)).toThrow();
});

it('locates the strongest bar accent separately from the beat phase', () => {
  const train = Float64Array.from({ length: 2000 }, (_, i) =>
    i % 100 === 25 ? (Math.floor(i / 100) % 4 === 2 ? 2 : 1) : 0,
  );
  const timing = tempo(train, 200, 120);
  expect(timing.downbeatSeconds).toBeCloseTo(1.125, 3);
  expect(timing.phaseSeconds).toBeCloseTo(0.125, 3);
  expect(tempo(new Float64Array(800), 200, 30).downbeatSeconds).toBe(0);
});

it('rejects a missing sample instead of silently accepting a DSP hole', () => {
  expect(() => sampleAt({ length: 2, 0: 1 }, 1)).toThrow('Missing sample');
});
