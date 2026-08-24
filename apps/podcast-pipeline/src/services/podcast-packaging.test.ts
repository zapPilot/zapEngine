import { describe, expect, it } from 'vitest';

import type { StoryboardDraft } from './video/storyboard/draft.js';
import {
  applyPodcastBrandingToStoryboard,
  packagePodcastScript,
  PODCAST_INTRO,
  PODCAST_INTRO_VISUAL_INTENT,
  ZAP_PILOT_OUTRO,
  ZAP_PILOT_OUTRO_VISUAL_INTENT,
} from './podcast-packaging.js';

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
});

describe('applyPodcastBrandingToStoryboard', () => {
  it('isolates intro/outro and replaces packaging-tainted search intents', () => {
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
        endSentenceId: 's0001',
        imageSearchIntent: [PODCAST_INTRO_VISUAL_INTENT],
      },
      {
        sceneId: 'scene-02',
        startSentenceId: 's0002',
        endSentenceId: 's0002',
        imageSearchIntent: ['第一段談聯準會資產負債表。'],
      },
      {
        sceneId: 'scene-03',
        startSentenceId: 's0003',
        endSentenceId: 's0003',
        imageSearchIntent: ['第二段談穩定幣支付。'],
      },
      {
        sceneId: 'scene-04',
        startSentenceId: 's0004',
        endSentenceId: 's0004',
        imageSearchIntent: [ZAP_PILOT_OUTRO_VISUAL_INTENT],
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
});
