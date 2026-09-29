import { describe, expect, it } from 'vitest';

import {
  applyAndValidatePodcastBrandingToStoryboard,
  applyPodcastBrandingToStoryboard,
  getPodcastEditorialScript,
  getPodcastEditorialSentences,
  packagePodcastScript,
  PODCAST_INTRO_VISUAL_INTENT,
  PODCAST_OUTRO_VISUAL_INTENT,
  podcastBrandVisualKind,
  podcastContentSceneCountRange,
  podcastEditorialSceneCountRange,
  splitPodcastVisualSections,
  stripKnownPodcastPackaging,
  validatePodcastStoryboardDraft,
} from './podcast-packaging.js';
import type { StoryboardDraft } from './video/storyboard/draft.js';
import { splitCanonicalSentences } from './video/storyboard/sentences.js';

describe('podcast packaging edge coverage', () => {
  it('classifies brand intents and leaves ordinary intents unclassified', () => {
    expect(podcastBrandVisualKind([PODCAST_INTRO_VISUAL_INTENT])).toBe('intro');
    expect(podcastBrandVisualKind([PODCAST_OUTRO_VISUAL_INTENT])).toBe('outro');
    expect(podcastBrandVisualKind(['macro liquidity'])).toBeNull();
  });

  it('drops storyboard scenes whose sentence ids do not exist', () => {
    const script = packagePodcastScript('第一句正文。第二句正文。');
    const draft: StoryboardDraft = {
      scenes: [
        {
          sceneId: 'scene-01',
          startSentenceId: 'missing-start',
          endSentenceId: 'missing-end',
          imageSearchIntent: ['unused'],
        },
      ],
    };

    expect(applyPodcastBrandingToStoryboard(script, draft)).toBe(draft);
  });

  it('drops scenes that fall entirely outside the editorial body', () => {
    const script = packagePodcastScript('唯一正文。');
    const sections = splitPodcastVisualSections(script);
    const draft: StoryboardDraft = {
      scenes: [
        {
          sceneId: 'scene-01',
          startSentenceId: sections.outro!.id,
          endSentenceId: sections.outro!.id,
          imageSearchIntent: ['outro-like editorial scene'],
        },
      ],
    };

    expect(applyPodcastBrandingToStoryboard(script, draft)).toBe(draft);
  });

  it('bounds oversized editorial drafts and carries the final sentence into the last kept scene', () => {
    const body = Array.from(
      { length: 70 },
      (_, index) => `正文第${index + 1}句。`,
    ).join('');
    const script = packagePodcastScript(body);
    const sections = splitPodcastVisualSections(script);
    const scenes = sections.body.map((sentence, index) => ({
      sceneId: `raw-${index + 1}`,
      startSentenceId: sentence.id,
      endSentenceId: sentence.id,
      imageSearchIntent: [`subject-${index + 1}`],
    }));

    const branded = applyPodcastBrandingToStoryboard(script, { scenes });

    expect(branded.scenes).toHaveLength(64);
    expect(branded.scenes.at(-2)?.endSentenceId).toBe(sections.body.at(-1)?.id);
    expect(branded.scenes.at(-1)?.imageSearchIntent).toEqual([
      PODCAST_OUTRO_VISUAL_INTENT,
    ]);
  });

  it('surfaces validation details for an invalid branded storyboard', () => {
    const script = packagePodcastScript('第一句正文。第二句正文。');
    const sentences = splitCanonicalSentences(script);
    const invalid: StoryboardDraft = {
      scenes: [
        {
          sceneId: 'scene-01',
          startSentenceId: sentences[1]!.id,
          endSentenceId: sentences[1]!.id,
          imageSearchIntent: [],
        },
      ],
    };

    expect(
      validatePodcastStoryboardDraft(script, invalid, 90_000).success,
    ).toBe(false);
    expect(() =>
      applyAndValidatePodcastBrandingToStoryboard(script, invalid, 90_000),
    ).toThrow('Branded podcast storyboard is invalid:');
  });

  it('covers packaged and unpackaged scene-count helpers and stripping variants', () => {
    const raw = '一般正文。';
    const packaged = packagePodcastScript(raw);
    expect(getPodcastEditorialScript(raw)).toBe(raw);
    expect(getPodcastEditorialSentences(raw)).toEqual(
      splitCanonicalSentences(raw),
    );
    expect(podcastContentSceneCountRange(60_000, 4, raw)).toEqual(
      expect.objectContaining({
        min: expect.any(Number),
        max: expect.any(Number),
      }),
    );
    expect(
      podcastContentSceneCountRange(60_000, 4, packaged).max,
    ).toBeLessThanOrEqual(63);
    expect(podcastEditorialSceneCountRange(60_000, 4, false)).toEqual(
      expect.objectContaining({
        min: expect.any(Number),
        max: expect.any(Number),
      }),
    );
    expect(
      podcastEditorialSceneCountRange(60_000, 4, true).max,
    ).toBeLessThanOrEqual(63);
    expect(stripKnownPodcastPackaging(`  ${packaged}  `)).toBe(raw);
  });

  it('rejects packaging when stripping leaves no editorial body', () => {
    expect(() => packagePodcastScript('   ')).toThrow(
      'Podcast body is empty after removing generated packaging',
    );
  });

  it('validates an unpackaged storyboard with the ordinary scene-count range', () => {
    const script = '只有正文。';
    const sentence = splitCanonicalSentences(script)[0]!;
    const result = validatePodcastStoryboardDraft(
      script,
      {
        scenes: [
          {
            sceneId: 'scene-01',
            startSentenceId: sentence.id,
            endSentenceId: sentence.id,
            imageSearchIntent: ['正文'],
          },
        ],
      },
      5_000,
    );
    expect(result.success).toBe(true);
  });
});
