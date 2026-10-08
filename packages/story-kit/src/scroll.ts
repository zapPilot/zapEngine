import { progress } from './timeline.js';
/** Section top relative to the viewport; travel excludes the sticky viewport. */
export function scrollProgress(
  top: number,
  sectionHeight: number,
  viewportHeight: number,
): number {
  return progress(-top, 0, Math.max(0, sectionHeight - viewportHeight));
}
