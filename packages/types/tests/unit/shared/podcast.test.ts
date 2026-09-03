import {
  EPISODE_VIDEO_VISUAL_VERSION,
  PODCAST_VIDEO_REVIEW_ISSUES,
  PODCAST_VIDEO_REVIEW_STATUSES,
  PODCAST_VIDEO_REVIEW_VERDICTS,
} from '../../../src/shared/podcast.js';

const KEBAB_CASE = /^[a-z]+(?:-[a-z]+)*$/;

describe('podcast shared contracts', () => {
  it('pins the visual version both claim RPCs fence on', () => {
    expect(EPISODE_VIDEO_VISUAL_VERSION).toMatch(
      /^podcast-image-visual-plan\.v\d+$/,
    );
  });

  it.each([
    ['verdicts', PODCAST_VIDEO_REVIEW_VERDICTS],
    ['issues', PODCAST_VIDEO_REVIEW_ISSUES],
    ['statuses', PODCAST_VIDEO_REVIEW_STATUSES],
  ])('keeps review %s non-empty, unique and kebab-case', (_label, values) => {
    expect(values.length).toBeGreaterThan(0);
    expect(new Set(values).size).toBe(values.length);
    for (const value of values) {
      expect(value).toMatch(KEBAB_CASE);
    }
  });

  it('keeps the catch-all issue category so operators can always file a review', () => {
    expect(PODCAST_VIDEO_REVIEW_ISSUES).toContain('other');
    expect(PODCAST_VIDEO_REVIEW_ISSUES).toContain('abstract-no-image');
  });
});
