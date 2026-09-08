import { describe, expect, it } from 'vitest';

import { escapeFilterPath } from './ffmpeg-filter-path.js';

describe('escapeFilterPath', () => {
  it('escapes backslashes, colons, and single quotes for an ffmpeg filtergraph argument', () => {
    expect(escapeFilterPath("C:\\videos\\it's a clip.mp4")).toBe(
      "C\\:\\\\videos\\\\it\\'s a clip.mp4",
    );
  });

  it('leaves a path with no special characters untouched', () => {
    expect(escapeFilterPath('/render-work/subtitle-smoke/captions.ass')).toBe(
      '/render-work/subtitle-smoke/captions.ass',
    );
  });
});
