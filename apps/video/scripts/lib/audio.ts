/** EBU R128 targets: −16 LUFS is the usual web/social delivery level. */
export const LOUDNESS_TARGET = { i: -16, tp: -1.5, lra: 11 } as const;

export interface LoudnessReport {
  readonly i: number;
  readonly tp: number;
  readonly lra: number;
  readonly thresh: number;
  readonly offset: number;
}

/** Reads the JSON block `loudnorm=print_format=json` writes to stderr. */
export function parseLoudnorm(stderr: string): LoudnessReport {
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No loudnorm report in output');
  const raw = JSON.parse(stderr.slice(start, end + 1)) as Record<
    string,
    string
  >;
  const field = (name: string) => Number(raw[name]);
  const report: LoudnessReport = {
    i: field('input_i'),
    tp: field('input_tp'),
    lra: field('input_lra'),
    thresh: field('input_thresh'),
    offset: field('target_offset'),
  };
  if (Object.values(report).some((value) => !Number.isFinite(value))) {
    throw new Error(
      `Unmeasurable loudness (silent input?): ${JSON.stringify(raw)}`,
    );
  }
  return report;
}

/**
 * The loudnorm filter. With a first-pass `measured` report it normalises
 * linearly (one gain for the whole clip, no pumping); without one it only
 * measures.
 */
export function loudnormFilter(measured?: LoudnessReport): string {
  const target = `I=${LOUDNESS_TARGET.i}:TP=${LOUDNESS_TARGET.tp}:LRA=${LOUDNESS_TARGET.lra}`;
  if (measured === undefined) return `loudnorm=${target}:print_format=json`;
  return [
    `loudnorm=${target}`,
    `measured_I=${measured.i}`,
    `measured_TP=${measured.tp}`,
    `measured_LRA=${measured.lra}`,
    `measured_thresh=${measured.thresh}`,
    `offset=${measured.offset}`,
    'linear=true:print_format=json',
  ].join(':');
}

export interface SpeechBounds {
  readonly start: number;
  readonly end: number;
}

/**
 * Where speech begins and ends, from `silencedetect` output, keeping `keep`
 * seconds of room tone on each side. TTS pads clips unevenly; trimming makes
 * the storyboard's lead-in, gap and tail the only spacing.
 */
export function speechBounds(
  stderr: string,
  durationSeconds: number,
  keep = 0.06,
): SpeechBounds {
  const silences: { start: number; end: number }[] = [];
  for (const [, kind, value] of stderr.matchAll(
    /silence_(start|end): (-?[\d.]+)/g,
  )) {
    if (kind === 'start') {
      silences.push({ start: Number(value), end: durationSeconds });
    } else if (silences.length > 0) {
      (silences.at(-1) as { end: number }).end = Number(value);
    }
  }
  const first = silences[0];
  const last = silences.at(-1);
  const speechStart =
    first !== undefined && first.start <= 0.01 ? first.end : 0;
  const speechEnd =
    last !== undefined && last.end >= durationSeconds - 0.02
      ? last.start
      : durationSeconds;
  if (speechEnd <= speechStart) return { start: 0, end: durationSeconds };
  return {
    start: Math.max(0, speechStart - keep),
    end: Math.min(durationSeconds, speechEnd + keep),
  };
}
