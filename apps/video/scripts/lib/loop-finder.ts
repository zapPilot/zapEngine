import {
  chroma,
  correlation,
  onsets,
  rms,
  sampleAt,
  spectrum,
  tempo,
} from './dsp';

export interface LoopCandidate {
  readonly startSeconds: number;
  readonly periodSeconds: number;
  readonly bpm: number;
  readonly bars: number;
  readonly score: number;
  readonly rho: number;
  readonly levelDifferenceDb: number;
  readonly spectralSimilarity: number;
  readonly chromaSimilarity: number;
}
/** Rank beat-aligned eight-bar candidates inside the longest stable RMS region. */
export function findLoops(
  samples: Float64Array,
  sampleRate: number,
  bpm: number,
  options: { bars?: number; start?: number; end?: number } = {},
): LoopCandidate[] {
  const bars = options.bars ?? 8;
  if (bars < 1 || !Number.isInteger(bars) || sampleRate < 1)
    throw new Error('Invalid loop options');
  const timing = tempo(onsets(samples), sampleRate / 240, bpm);
  const period = bars * 4 * timing.beatSeconds,
    crossfade = 0.2;
  const min = options.start ?? 0,
    max = options.end ?? samples.length / sampleRate;
  if (min < 0 || max > samples.length / sampleRate || max <= min)
    throw new Error('Invalid loop region');
  const seconds = Math.floor(max),
    levels = Array.from({ length: seconds }, (_, s) =>
      rms(samples.subarray(s * sampleRate, (s + 1) * sampleRate)),
    );
  let longest = { start: min, end: min },
    start = min;
  for (let s = Math.ceil(min) + 1; s <= seconds; s++) {
    if (
      s < seconds &&
      Math.abs(
        20 *
          Math.log10(
            (sampleAt(levels, s) + 1e-10) / (sampleAt(levels, s - 1) + 1e-10),
          ),
      ) < 3
    )
      continue;
    if (s - start > longest.end - longest.start) longest = { start, end: s };
    start = s;
  }
  // An explicit region is an operator-owned override; otherwise stay in the stable region.
  const region =
    options.start === undefined ? longest : { start: min, end: max };
  const candidates: LoopCandidate[] = [];
  for (
    let at = timing.downbeatSeconds;
    at + period + crossfade <= region.end;
    at += timing.beatSeconds
  ) {
    if (at < region.start) continue;
    const a = samples.subarray(
      Math.round(at * sampleRate),
      Math.round((at + crossfade) * sampleRate),
    );
    const b = samples.subarray(
      Math.round((at + period) * sampleRate),
      Math.round((at + period) * sampleRate) + a.length,
    );
    if (b.length !== a.length || a.length < 2048 || rms(a) < 0.001) continue;
    const sa = spectrum(a.subarray(0, 2048)),
      sb = spectrum(b.subarray(0, 2048));
    const spectralSimilarity = correlation(sa, sb),
      chromaSimilarity = correlation(
        chroma(sa, sampleRate),
        chroma(sb, sampleRate),
      );
    const levelDifferenceDb = Math.abs(20 * Math.log10(rms(a) / rms(b)));
    const rho = Math.max(0, correlation(a, b));
    const score =
      1 -
      spectralSimilarity +
      (1 - chromaSimilarity) +
      levelDifferenceDb / 6 +
      (1 - rho) * 0.1;
    if (
      levelDifferenceDb > 3 ||
      spectralSimilarity < 0.5 ||
      chromaSimilarity < 0.5
    )
      continue;
    candidates.push({
      startSeconds: at,
      periodSeconds: period,
      bpm: timing.bpm,
      bars,
      score,
      rho,
      levelDifferenceDb,
      spectralSimilarity,
      chromaSimilarity,
    });
  }
  return candidates.sort((a, b) => a.score - b.score).slice(0, 5);
}
