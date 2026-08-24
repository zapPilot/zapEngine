import { describe, expect, it } from 'vitest';

import {
  applyAndValidatePodcastBrandingToStoryboard,
  applyPodcastBrandingToStoryboard,
  getPodcastEditorialScript,
  getPodcastEditorialSentences,
  packagePodcastScript,
  PODCAST_INTRO,
  PODCAST_INTRO_VISUAL_INTENT,
  PODCAST_OUTRO_VISUAL_INTENT,
  splitPodcastVisualSections,
  ZAP_PILOT_OUTRO,
} from './podcast-packaging.js';
import type { StoryboardDraft } from './video/storyboard/draft.js';
import { createDeterministicStoryboard } from './video/storyboard/fallback.js';
import { splitCanonicalSentences } from './video/storyboard/sentences.js';

describe('packagePodcastScript', () => {
  it('wraps only the generated body with application-owned branding', () => {
    expect(packagePodcastScript('正文第一句。\n正文第二句。')).toBe(
      `${PODCAST_INTRO}\n\n正文第一句。\n正文第二句。\n\n${ZAP_PILOT_OUTRO}`,
    );
  });

  it('removes the legacy generated greeting before packaging', () => {
    expect(
      packagePodcastScript(
        '各位觀眾朋友，歡迎收聽今天的 Zap Podcast。\n\n真正正文。',
      ),
    ).toBe(`${PODCAST_INTRO}\n\n真正正文。\n\n${ZAP_PILOT_OUTRO}`);
  });

  it('does not duplicate the current outro when retry output already contains it', () => {
    expect(packagePodcastScript(`真正正文。\n\n${ZAP_PILOT_OUTRO}`)).toBe(
      `${PODCAST_INTRO}\n\n真正正文。\n\n${ZAP_PILOT_OUTRO}`,
    );
  });

  it('does not duplicate the current intro when retry output already contains it', () => {
    expect(packagePodcastScript(`${PODCAST_INTRO}\n\n真正正文。`)).toBe(
      `${PODCAST_INTRO}\n\n真正正文。\n\n${ZAP_PILOT_OUTRO}`,
    );
  });
});

describe('applyPodcastBrandingToStoryboard', () => {
  it('isolates only the intro and preserves content search intents', () => {
    const script = packagePodcastScript(
      '第一段談聯準會資產負債表。\n第二段談穩定幣支付。',
    );
    const draft: StoryboardDraft = {
      scenes: [
        {
          sceneId: 'scene-01',
          startSentenceId: 's0001',
          endSentenceId: 's0002',
          imageSearchIntent: ['podcast studio microphone'],
        },
        {
          sceneId: 'scene-02',
          startSentenceId: 's0003',
          endSentenceId: 's0004',
          imageSearchIntent: ['podcast host outro'],
        },
      ],
    };

    const branded = applyPodcastBrandingToStoryboard(script, draft);

    expect(branded.scenes).toEqual([
      {
        sceneId: 'scene-01',
        startSentenceId: 's0001',
        endSentenceId: 's0002',
        imageSearchIntent: ['podcast studio microphone'],
      },
      {
        sceneId: 'scene-02',
        startSentenceId: 's0003',
        endSentenceId: 's0003',
        imageSearchIntent: ['podcast host outro'],
      },
      {
        sceneId: 'scene-03',
        startSentenceId: 's0004',
        endSentenceId: 's0004',
        imageSearchIntent: [PODCAST_OUTRO_VISUAL_INTENT],
      },
    ]);
  });

  it('leaves legacy scripts unchanged', () => {
    const draft: StoryboardDraft = {
      scenes: [
        {
          sceneId: 'scene-01',
          startSentenceId: 's0001',
          endSentenceId: 's0001',
          imageSearchIntent: ['market'],
        },
      ],
    };

    expect(applyPodcastBrandingToStoryboard('只有正文。', draft)).toBe(draft);
  });

  it('keeps a 90-second packaged episode within the renderer scene limit', () => {
    const script = packagePodcastScript(
      Array.from({ length: 12 }, (_, index) => `第${index + 1}段正文。`).join(
        '',
      ),
    );
    const editorialScript = getPodcastEditorialScript(script);
    const editorialSentences = getPodcastEditorialSentences(script);
    const content = createDeterministicStoryboard({
      title: '市場觀察',
      script: editorialScript,
      durationMs: 90_000,
      sentences: editorialSentences,
      isPackaged: true,
    });

    const branded = applyAndValidatePodcastBrandingToStoryboard(
      script,
      content,
      90_000,
    );

    expect(content.scenes.length).toBeGreaterThanOrEqual(7);
    expect(content.scenes.length).toBeLessThanOrEqual(9);
    expect(branded.scenes.length).toBeGreaterThanOrEqual(8);
    expect(branded.scenes.length).toBeLessThanOrEqual(10);
    expect(branded.scenes.at(-1)?.endSentenceId).toBe(
      splitCanonicalSentences(script).at(-1)?.id,
    );
    // First scene extends intro for timing but keeps body visual intent
    expect(branded.scenes[0]?.startSentenceId).toBe(
      splitPodcastVisualSections(script).intro?.id,
    );
    expect(branded.scenes[0]?.imageSearchIntent).not.toContain(
      PODCAST_INTRO_VISUAL_INTENT,
    );
    expect(branded.scenes.at(-1)?.imageSearchIntent).toEqual([
      PODCAST_OUTRO_VISUAL_INTENT,
    ]);
  });

  it('reserves one of 64 storyboard slots for the packaged outro', () => {
    const script = packagePodcastScript(
      Array.from(
        { length: 100 },
        (_, index) => `長篇正文第${index + 1}句。`,
      ).join(''),
    );
    const editorialScript = getPodcastEditorialScript(script);
    const editorialSentences = getPodcastEditorialSentences(script);
    const content = createDeterministicStoryboard({
      title: '長篇市場觀察',
      script: editorialScript,
      durationMs: 12.8 * 60_000,
      sentences: editorialSentences,
      isPackaged: true,
    });

    const branded = applyAndValidatePodcastBrandingToStoryboard(
      script,
      content,
      12.8 * 60_000,
    );

    expect(content.scenes).toHaveLength(63);
    expect(branded.scenes).toHaveLength(64);
    expect(branded.scenes.at(-1)?.imageSearchIntent).toEqual([
      PODCAST_OUTRO_VISUAL_INTENT,
    ]);
  });
});
