import { describe, expect, it } from 'vitest';

import { composeSocialContent } from './compose.js';
import type { GeneratedSocialCopy, SocialEpisode } from './types.js';

const copy: GeneratedSocialCopy = {
  topic: 'macro',
  hookType: 'question',
  x: { text: '利率轉向了嗎？' },
  rednote: {
    title: '利率真的轉向？',
    body: '這集拆解了三個訊號。',
    hashtags: ['宏觀經濟', '市場結構', '產業研究'],
  },
};

const episode: Pick<SocialEpisode, 'title' | 'summary' | 'description'> = {
  title: '聯準會的下一步',
  summary: '本集摘要。',
  description: '來源文章描述。',
};

describe('composeSocialContent', () => {
  it('gives X and Threads the same CTA-suffixed body and no title', () => {
    for (const platform of ['x', 'threads'] as const) {
      expect(composeSocialContent(platform, { copy, episode })).toEqual({
        title: null,
        body: '利率轉向了嗎？\n\n官網 https://www.zap-pilot.org',
        hashtags: [],
      });
    }
  });

  it('maps Rednote onto its own title field with no off-platform CTA', () => {
    expect(composeSocialContent('rednote', { copy, episode })).toEqual({
      title: '利率真的轉向？',
      body: '這集拆解了三個訊號。',
      hashtags: ['宏觀經濟', '市場結構', '產業研究'],
    });
  });

  it('assembles YouTube metadata from the episode, preferring the article description', () => {
    expect(composeSocialContent('youtube', { copy, episode })).toEqual({
      title: '聯準會的下一步',
      body: '來源文章描述。\n\n更多市場洞察與工具：https://www.zap-pilot.org',
      hashtags: [],
    });

    expect(
      composeSocialContent('youtube', {
        copy,
        episode: { ...episode, description: '   ' },
      }).body,
    ).toBe('本集摘要。\n\n更多市場洞察與工具：https://www.zap-pilot.org');
  });

  it('truncates the YouTube title to 100 characters and the description to 4500', () => {
    const composed = composeSocialContent('youtube', {
      copy,
      episode: {
        title: `  ${'界'.repeat(120)}  `,
        summary: 'S'.repeat(5_000),
        description: '   ',
      },
    });
    expect(Array.from(composed.title ?? '')).toHaveLength(100);
    expect(composed.body.startsWith('S'.repeat(4_500))).toBe(true);
    expect(composed.body).toContain('https://www.zap-pilot.org');
  });

  // The generated telemetry columns are defined as "before fixed branding".
  it('omits the CTA for the generated snapshot without changing the mapping', () => {
    expect(composeSocialContent('x', { copy, episode, cta: 'omit' })).toEqual({
      title: null,
      body: '利率轉向了嗎？',
      hashtags: [],
    });
    expect(
      composeSocialContent('rednote', { copy, episode, cta: 'omit' }),
    ).toEqual(composeSocialContent('rednote', { copy, episode }));
    // YouTube copy is assembled rather than written, so there is no
    // pre-branding version of it to record.
    expect(
      composeSocialContent('youtube', { copy, episode, cta: 'omit' }),
    ).toEqual(composeSocialContent('youtube', { copy, episode }));
  });

  it('leaves the YouTube description empty rather than CTA-only when the episode has no summary', () => {
    expect(
      composeSocialContent('youtube', {
        copy,
        episode: { title: '聯準會的下一步', summary: '   ', description: '  ' },
      }),
    ).toEqual({ title: '聯準會的下一步', body: '', hashtags: [] });
  });

  it('rejects unsupported platform values at the exhaustive boundary', () => {
    expect(() =>
      composeSocialContent('mastodon' as never, { copy, episode }),
    ).toThrow('Unsupported social platform: mastodon');
  });
});
