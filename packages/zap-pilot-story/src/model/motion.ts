import { clamp, easeInOutCubic } from '@zapengine/story-kit';
export const cameraProgress = (
  time: number,
  start: number,
  end: number,
): number =>
  end > start ? easeInOutCubic(clamp((time - start) / (end - start))) : 1;
