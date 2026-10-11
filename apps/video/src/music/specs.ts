/**
 * Every registered loop: the paid source it is cut from, and where the free
 * cutter looks for it. A loop without an accepted clip yet carries the prompt
 * its source takes are generated from; once cut, the clip's provenance JSON in
 * public/music/ records the prompt instead.
 */
export interface LoopSpec {
  /** Stem of the full paid source kept in music/sources/. */
  readonly source: string;
  /** Tempo the loop finder searches at. */
  readonly bpm: number;
  /** Latest source second a candidate loop may start. */
  readonly end: number;
  /** Generation prompt, until a cut clip records it. */
  readonly prompt?: string;
}

export const LOOP_SPECS = {
  'gentle-88': { source: 'kokode-clinic', bpm: 88, end: 65 },
  'drive-112': { source: 'calculator-pitch', bpm: 112, end: 50 },
  'launch-120': {
    source: 'kokode-promo',
    bpm: 120,
    end: 70,
    prompt:
      'Instrumental only, absolutely no vocals, voices, humming or choir. Duration 90 seconds, clean ending. Underscore beneath English narration for a fast-cut medical technology product launch video. 120 BPM, C major, steady 4/4, repeating C–G–Am–F progression. Tight punchy kick on every beat, crisp claps on 2 and 4, light closed and open hi-hats, warm eighth-note sub bass, bright plucked synthesizer arpeggio in sixteenth notes, wide warm pads with gentle sidechain pumping, soft electric piano accents. Confident, modern, optimistic and clean. Sparse 1–4 kHz region for intelligible speech, no dominant lead melody. [0:00–0:16] filtered plucks and pads building anticipation; [0:16–1:16] one steady full groove with the same chords every 8 bars and only subtle layering; [1:16–1:30] warm resolution into a clear final chord and clean cadence. No vocal chops, dubstep drops, distortion or cinematic booms. Begin audible music immediately, no silent intro.',
  },
} as const satisfies Readonly<Record<string, LoopSpec>>;

export type LoopSpecId = keyof typeof LOOP_SPECS;

export const LOOP_IDS = Object.keys(LOOP_SPECS) as [
  LoopSpecId,
  ...LoopSpecId[],
];

export function isLoopSpecId(id: string | undefined): id is LoopSpecId {
  return id !== undefined && Object.hasOwn(LOOP_SPECS, id);
}
