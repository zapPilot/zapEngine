import { z } from 'zod';

import type { Timeline } from '../timeline/timeline';
import { CAPTION_LANGS, type Storyboard } from '../timeline/types';

/**
 * Props every narrated composition takes; Studio edits them through this
 * schema. Data-only (no React, no runtime Remotion), so scripts can import it.
 */
export const videoPropsSchema = z.object({
  captions: z.boolean(),
  music: z.boolean(),
  lang: z.enum(CAPTION_LANGS),
});

export type VideoProps = z.infer<typeof videoPropsSchema>;

/** What Studio opens with and what `stills` and `render` pass. */
export const defaultVideoProps: Omit<VideoProps, 'lang'> = {
  captions: true,
  music: true,
};

/** `calculateMetadata` for a storyboard: length from its narrated timeline. */
export function storyboardMetadata(storyboard: Storyboard, timeline: Timeline) {
  return {
    durationInFrames: timeline.durationInFrames,
    fps: storyboard.fps,
    width: storyboard.width,
    height: storyboard.height,
    defaultOutName: storyboard.id,
  };
}
