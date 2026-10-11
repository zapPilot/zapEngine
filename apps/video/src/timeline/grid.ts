import { type LoopId, musicLoop } from '../music/library';

/**
 * The music's beat on the frame clock. Every loop's period spans whole 4/4
 * bars (`cut.bars`) and starts the bed at frame 0, so beat k sits at
 * `k × framesPerBeat`, rounded to the nearest frame.
 */
export function framesPerBeat(loop: LoopId): number {
  const { periodSamples, sampleRate, fps, cut } = musicLoop(loop);
  return ((periodSamples / sampleRate) * fps) / (cut.bars * 4);
}

/**
 * The first beat frame at or after `frame`. Beat k lands on frame
 * round(k × perBeat), which reaches `frame` once k × perBeat ≥ frame − ½.
 */
export function beatAtOrAfter(frame: number, perBeat: number): number {
  const k = Math.max(0, Math.ceil((frame - 0.5) / perBeat));
  return Math.round(k * perBeat);
}

/**
 * Scene-relative frame of beat `n` counted from the scene start, for visuals
 * that land on the music rather than on a spoken word.
 */
export function beatFrame(
  sceneFrom: number,
  n: number,
  perBeat: number,
): number {
  const first = Math.round(sceneFrom / perBeat);
  return Math.round((first + n) * perBeat) - sceneFrom;
}
