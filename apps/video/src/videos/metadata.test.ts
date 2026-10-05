import { describe, expect, it } from 'vitest';

import type { Timeline } from '../timeline/timeline';
import type { Storyboard } from '../timeline/types';
import {
  defaultVideoProps,
  storyboardMetadata,
  videoPropsSchema,
} from './metadata';

describe('video props', () => {
  it('default to captions and music on, and validate', () => {
    expect(
      videoPropsSchema.parse({ ...defaultVideoProps, lang: 'ja' }),
    ).toEqual({
      captions: true,
      music: true,
      lang: 'ja',
    });
    expect(videoPropsSchema.safeParse({ captions: 'yes' }).success).toBe(false);
  });
});

describe('storyboardMetadata', () => {
  it('takes size and fps from the storyboard and length from its timeline', () => {
    const storyboard: Storyboard = {
      id: 'clip',
      fps: 30,
      width: 1080,
      height: 1920,
      maxSeconds: 30,
      transitionFrames: 10,
      leadIn: 12,
      tail: 12,
      gap: 6,
      music: { src: 'music/test.mp3', prompt: 'Instrumental' },
      voice: { speed: 1, voice: 'hannah' },
      scenes: [],
    };
    const timeline: Timeline = {
      durationInFrames: 812,
      scenes: [],
      voice: [],
      captions: [],
      estimatedLines: [],
    };
    expect(storyboardMetadata(storyboard, timeline)).toEqual({
      durationInFrames: 812,
      fps: 30,
      width: 1080,
      height: 1920,
      defaultOutName: 'clip',
    });
  });
});
