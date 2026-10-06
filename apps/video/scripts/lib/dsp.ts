/** A checked numeric lookup for bounded DSP loops and malformed ArrayLike inputs. */
export function sampleAt(samples: ArrayLike<number>, index: number): number {
  const value = samples[index];
  if (value === undefined) throw new Error(`Missing sample ${index}`);
  return value;
}
export function rms(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += sampleAt(samples, i) ** 2;
  return Math.sqrt(sum / samples.length);
}
export function correlation(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
): number {
  if (a.length !== b.length || a.length === 0)
    throw new Error('Correlation requires matching samples');
  let cross = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    cross += sampleAt(a, i) * sampleAt(b, i);
    aa += sampleAt(a, i) ** 2;
    bb += sampleAt(b, i) ** 2;
  }
  return aa * bb === 0
    ? 0
    : Math.max(-1, Math.min(1, cross / Math.sqrt(aa * bb)));
}
/** Radix-2 FFT magnitude, used for onset and spectral/chroma comparisons. */
export function spectrum(samples: ArrayLike<number>): Float64Array {
  const n = samples.length;
  if (n < 2 || (n & (n - 1)) !== 0)
    throw new Error('FFT length must be a power of two');
  const real = Float64Array.from(samples),
    imag = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      const swapped = real[i] as number;
      real[i] = real[j] as number;
      real[j] = swapped;
    }
  }
  for (let size = 2; size <= n; size *= 2) {
    for (let start = 0; start < n; start += size)
      for (let j = 0; j < size / 2; j++) {
        const angle = (-2 * Math.PI * j) / size,
          c = Math.cos(angle),
          s = Math.sin(angle),
          k = start + j,
          q = k + size / 2;
        const rq = real[q] as number,
          iq = imag[q] as number,
          rk = real[k] as number,
          ik = imag[k] as number;
        const r = rq * c - iq * s,
          im = rq * s + iq * c;
        real[q] = rk - r;
        imag[q] = ik - im;
        real[k] = rk + r;
        imag[k] = ik + im;
      }
  }
  const magnitudes = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++)
    magnitudes[i] = Math.hypot(real[i] as number, imag[i] as number);
  return magnitudes;
}
export function chroma(
  magnitudes: ArrayLike<number>,
  sampleRate: number,
): Float64Array {
  const bins = new Float64Array(12);
  for (let i = 1; i < magnitudes.length; i++) {
    const hz = (i * sampleRate) / (magnitudes.length * 2);
    if (hz < 55 || hz > 5000) continue;
    const pitch = ((Math.round(69 + 12 * Math.log2(hz / 440)) % 12) + 12) % 12;
    bins[pitch] = sampleAt(bins, pitch) + sampleAt(magnitudes, i);
  }
  return bins;
}
export function onsets(
  samples: Float64Array,
  window = 1024,
  hop = 240,
): Float64Array {
  if (samples.length < window || hop < 1)
    throw new Error('Insufficient onset samples');
  const count = Math.floor((samples.length - window) / hop) + 1;
  const flux = new Float64Array(count);
  let previous: Float64Array = new Float64Array(window / 2);
  for (let index = 0; index < count; index++) {
    const next = spectrum(samples.subarray(index * hop, index * hop + window));
    let value = 0;
    for (let i = 0; i < next.length; i++)
      value += Math.max(0, (next[i] as number) - (previous[i] as number));
    flux[index] = value;
    previous = next;
  }
  return flux;
}
/** Comb ACF near the prompt tempo; sub-hop precision comes from quadratic interpolation. */
export function tempo(
  onset: Float64Array,
  onsetRate: number,
  bpm: number,
): {
  bpm: number;
  beatSeconds: number;
  phaseSeconds: number;
  downbeatSeconds: number;
} {
  if (onset.length < onsetRate * 4 || bpm < 30 || bpm > 240 || onsetRate < 1)
    throw new Error('Invalid tempo input');
  const center = (60 * onsetRate) / bpm,
    scores = new Float64Array(
      Math.ceil(center * 1.04) - Math.max(1, Math.floor(center * 0.96)) + 3,
    );
  const low = Math.max(1, Math.floor(center * 0.96)),
    high = Math.ceil(center * 1.04);
  for (let lag = low - 1; lag <= high + 1; lag++) {
    let score = 0;
    for (let multiple = 1; multiple <= 4; multiple++)
      for (let i = lag * multiple; i < onset.length; i++)
        score +=
          (sampleAt(onset, i) * sampleAt(onset, i - lag * multiple)) / multiple;
    scores[lag - low + 1] = score;
  }
  let best = low;
  for (let lag = low + 1; lag <= high; lag++)
    if (sampleAt(scores, lag - low + 1) > sampleAt(scores, best - low + 1))
      best = lag;
  const left = sampleAt(scores, best - 1 - low + 1),
    mid = sampleAt(scores, best - low + 1),
    right = sampleAt(scores, best + 1 - low + 1);
  const denominator = left - 2 * mid + right;
  const refined =
    best +
    (denominator === 0
      ? 0
      : Math.max(-0.5, Math.min(0.5, (0.5 * (left - right)) / denominator)));
  let phase = 0,
    phaseScore = -Infinity;
  for (let p = 0; p < refined; p++) {
    let score = 0;
    for (let i = p; i < onset.length; i += refined)
      score += onset[Math.round(i)] ?? 0;
    if (score > phaseScore) {
      phaseScore = score;
      phase = p;
    }
  }
  const accents = Array.from({ length: 4 }, (_, beat) => {
    let score = 0,
      count = 0;
    for (
      let i = phase + beat * refined;
      Math.round(i) < onset.length;
      i += refined * 4
    ) {
      score += sampleAt(onset, Math.round(i));
      count++;
    }
    return score / Math.max(1, count);
  });
  let downbeat = 0;
  for (let beat = 1; beat < 4; beat++)
    if (sampleAt(accents, beat) > sampleAt(accents, downbeat)) downbeat = beat;
  return {
    bpm: (60 * onsetRate) / refined,
    beatSeconds: refined / onsetRate,
    phaseSeconds: phase / onsetRate,
    downbeatSeconds: (phase + downbeat * refined) / onsetRate,
  };
}

/** Recomputed from the encoded clip in CI, not trusted from provenance alone. */
export function seamMetrics(
  samples: Float64Array,
  period: number,
  crossfade: number,
  sampleRate: number,
) {
  const a = samples.subarray(0, crossfade),
    b = samples.subarray(period, period + crossfade);
  if (
    period < 1 ||
    crossfade < 2048 ||
    b.length !== a.length ||
    rms(a) === 0 ||
    rms(b) === 0
  )
    throw new Error('Invalid or silent seam');
  const sa = spectrum(a.subarray(0, 2048)),
    sb = spectrum(b.subarray(0, 2048));
  const spectralSimilarity = correlation(sa, sb),
    chromaSimilarity = correlation(
      chroma(sa, sampleRate),
      chroma(sb, sampleRate),
    );
  const levelDifferenceDb = Math.abs(20 * Math.log10(rms(a) / rms(b)));
  const rho = Math.max(0, correlation(a, b));
  return {
    rho,
    levelDifferenceDb,
    spectralSimilarity,
    chromaSimilarity,
    score:
      1 -
      spectralSimilarity +
      (1 - chromaSimilarity) +
      levelDifferenceDb / 6 +
      (1 - rho) * 0.1,
  };
}
