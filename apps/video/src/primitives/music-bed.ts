export interface BedCopy {
  readonly from: number;
  readonly durationInFrames: number;
  readonly fadeIn: boolean;
  readonly fadeOut: boolean;
}
export function bedCopies(
  duration: number,
  period: number,
  crossfade: number,
): BedCopy[] {
  if (
    ![duration, period, crossfade].every(Number.isInteger) ||
    duration < 1 ||
    period < 1 ||
    crossfade < 1 ||
    crossfade >= period
  )
    throw new Error('Invalid music bed frames');
  return Array.from({ length: Math.ceil(duration / period) }, (_, k) => ({
    from: k * period,
    durationInFrames: Math.min(period + crossfade, duration - k * period),
    fadeIn: k > 0,
    fadeOut: (k + 1) * period < duration,
  }));
}
/** Correlation-adjusted equal power: correlated material uses linear gains. */
export function crossfadeGain(progress: number, rho: number): number {
  if (!Number.isFinite(progress) || !Number.isFinite(rho) || rho < 0 || rho > 1)
    throw new Error('Invalid crossfade');
  const t = Math.max(0, Math.min(1, progress));
  const a = t,
    b = 1 - t;
  return a / Math.sqrt(a * a + b * b + 2 * rho * a * b);
}
export function copyGain(
  frame: number,
  copy: BedCopy,
  period: number,
  crossfade: number,
  rho: number,
): number {
  if (copy.fadeIn && frame < crossfade)
    return crossfadeGain(frame / crossfade, rho);
  if (copy.fadeOut && frame >= period)
    return crossfadeGain((period + crossfade - frame) / crossfade, rho);
  return 1;
}
