import { describe, expect, it } from 'vitest';

import { composeSocialContent } from './compose.js';
import type { GeneratedSocialCopy, SocialEpisode } from './types.js';

const copy: GeneratedSocialCopy = {
  topic: 'macro',
  x: { hookType: 'question', text: '利率轉向了嗎？' },
  threads: { hookType: 'contrarian', text: '利率轉向，真的開始了嗎？' },
  rednote: {
    hookType: 'question',
    title: '利率真的轉向？',
    body: '這集拆解了三個訊號。',
    hashtags: ['宏觀經濟', '市場結構', '產業研究'],
  },
  youtube: { hookType: 'explainer', title: '聯準會的下一步' },
};

const episode: Pick<SocialEpisode, 'title' | 'summary' | 'description'> = {
  title: '聯準會的下一步',
  summary: '本集摘要。',
  description: '來源文章描述。',
};

describe('composeSocialContent', () => {
  it('uses native X and Threads copy with their own hook taxonomy', () => {
    expect(composeSocialContent('x', { copy, episode })).toEqual({
      title: null,
      body: '利率轉向了嗎？\n\n官網 https://www.zap-pilot.org',
      hashtags: [],
      hookType: 'question',
    });
    expect(composeSocialContent('threads', { copy, episode })).toEqual({
      title: null,
      body: '利率轉向，真的開始了嗎？\n\n官網 https://www.zap-pilot.org',
      hashtags: [],
      hookType: 'contrarian',
    });
  });

  it('maps Rednote onto its own title field with no off-platform CTA', () => {
    expect(composeSocialContent('rednote', { copy, episode })).toEqual({
      title: '利率真的轉向？',
      body: '這集拆解了三個訊號。',
      hashtags: ['宏觀經濟', '市場結構', '產業研究'],
      hookType: 'question',
    });
  });

  it('assembles YouTube metadata from the episode, preferring the article description', () => {
    expect(composeSocialContent('youtube', { copy, episode })).toEqual({
      title: '聯準會的下一步',
      body: '來源文章描述。\n\n更多市場洞察與工具：https://www.zap-pilot.org',
      hashtags: [],
      hookType: 'explainer',
    });

    expect(
      composeSocialContent('youtube', {
        copy,
        episode: { ...episode, description: '   ' },
      }).body,
    ).toBe('本集摘要。\n\n更多市場洞察與工具：https://www.zap-pilot.org');
  });

  it('preserves the validated generated YouTube title and truncates the description to 4500', () => {
    const composed = composeSocialContent('youtube', {
      copy,
      episode: {
        title: `  ${'界'.repeat(120)}  `,
        summary: 'S'.repeat(5_000),
        description: '   ',
      },
    });
    expect(composed.title).toBe('聯準會的下一步');
    expect(composed.body.startsWith('S'.repeat(4_500))).toBe(true);
    expect(composed.body).toContain('https://www.zap-pilot.org');
  });

  // The generated telemetry columns are defined as "before fixed branding".
  it('omits the CTA for the generated snapshot without changing the mapping', () => {
    expect(composeSocialContent('x', { copy, episode, cta: 'omit' })).toEqual({
      title: null,
      body: '利率轉向了嗎？',
      hashtags: [],
      hookType: 'question',
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
    ).toEqual({
      title: '聯準會的下一步',
      body: '',
      hashtags: [],
      hookType: 'explainer',
    });
  });

  it('rejects unsupported platform values at the exhaustive boundary', () => {
    expect(() =>
      composeSocialContent('mastodon' as never, { copy, episode }),
    ).toThrow('Unsupported social platform: mastodon');
  });
});
