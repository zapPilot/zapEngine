import { describe, expect, it } from 'vitest';

import { composeSocialContent, resolveTransportTitle } from './compose.js';
import { applyPlatformCta } from './platforms.js';
import type { GeneratedSocialCopy, SocialEpisode } from './types.js';

const copy: GeneratedSocialCopy = {
  topic: 'macro',
  x: { hookType: 'question', text: '利率轉向了嗎？' },
  threads: { hookType: 'contrarian', text: '利率轉向，真的開始了嗎？' },
  rednote: {
    hookType: 'question',
    body: '這集拆解了三個訊號。',
    hashtags: ['宏觀經濟', '市場結構', '產業研究'],
  },
  youtube: { hookType: 'explainer' },
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

  it('uses the canonical episode title for Rednote with no off-platform CTA', () => {
    expect(composeSocialContent('rednote', { copy, episode })).toEqual({
      title: '聯準會的下一步',
      body: '這集拆解了三個訊號。',
      hashtags: ['宏觀經濟', '市場結構', '產業研究'],
      hookType: 'question',
    });
  });

  it('publishes a Best Title that fits as-is instead of cutting it (live counter 14 / 20)', () => {
    const title = 'ether.fi为何告别EigenLayer？';
    expect(
      composeSocialContent('rednote', { copy, episode: { ...episode, title } })
        .title,
    ).toBe(title);
  });

  it('accepts a Best Title at exactly the budget (live counter 20 / 20)', () => {
    const title = 'Quant一周暴涨300% 代币化存款赛道为何火了';
    expect(resolveTransportTitle({ ...episode, title }, 'rednote')).toEqual({
      title,
      reason: null,
    });
  });

  it.each([
    ['live counter 21 / 20', 'Bitget遭3.5億美元駭客攻擊，資金追蹤全解析'],
    ['21 full-width characters', '標'.repeat(21)],
    ['emoji (two units each)', '😀'.repeat(11)],
  ])(
    'never truncates an over-budget Rednote title and never throws (%s)',
    (_label, title) => {
      const composed = composeSocialContent('rednote', {
        copy,
        episode: { ...episode, title },
      });
      expect(composed.title).toBeNull();
      expect(composed.body).toBe('這集拆解了三個訊號。');
      expect(
        resolveTransportTitle({ ...episode, title }, 'rednote').reason,
      ).toMatch(/over budget|no valid stored variant/);
    },
  );

  it('accepts a 10-emoji title, which fills exactly 20 units', () => {
    expect(
      resolveTransportTitle({ ...episode, title: '😀'.repeat(10) }, 'rednote')
        .title,
    ).toBe('😀'.repeat(10));
  });

  it('prefers a Best Title that fits over a stored variant', () => {
    const resolved = resolveTransportTitle(
      {
        ...episode,
        title: '聯準會的下一步',
        titleVariants: { '20': { title: '另一個標題', method: 'llm' } },
      },
      'rednote',
    );
    expect(resolved.title).toBe('聯準會的下一步');
  });

  it('falls back to a valid llm variant when the Best Title does not fit', () => {
    const frozen = {
      ...episode,
      title: '标'.repeat(30),
      titleVariants: { '20': { title: '你用USDT买到什么？', method: 'llm' } },
    };
    expect(
      composeSocialContent('rednote', { copy, episode: frozen }).title,
    ).toBe('你用USDT买到什么？');
  });

  it('still accepts a legacy llm variant of at most 20 code points', () => {
    const variant = '标'.repeat(20);
    expect(
      resolveTransportTitle(
        {
          ...episode,
          title: '标'.repeat(30),
          titleVariants: { '20': { title: variant, method: 'llm' } },
        },
        'rednote',
      ).title,
    ).toBe(variant);
  });

  it.each([
    [
      'a legacy truncate variant',
      { '20': { title: '截斷標題', method: 'truncate' } },
    ],
    [
      'an over-budget llm variant',
      { '20': { title: '标'.repeat(21), method: 'llm' } },
    ],
    ['no variants', {}],
  ])(
    'resolves to null with %s and an over-budget Best Title',
    (_l, titleVariants) => {
      const resolved = resolveTransportTitle(
        { ...episode, title: '标'.repeat(30), titleVariants },
        'rednote',
      );
      expect(resolved.title).toBeNull();
      expect(resolved.reason).toContain('no valid stored variant');
    },
  );

  it('uses a fitting override as-is, ahead of the Best Title', () => {
    expect(resolveTransportTitle(episode, 'rednote', '  人工標題  ')).toEqual({
      title: '人工標題',
      reason: null,
    });
    expect(
      composeSocialContent('rednote', {
        copy,
        episode,
        titleOverride: '人工標題',
      }).title,
    ).toBe('人工標題');
  });

  it('rejects an over-budget override without falling back to the Best Title', () => {
    const resolved = resolveTransportTitle(episode, 'rednote', '標'.repeat(21));
    expect(resolved.title).toBeNull();
    expect(resolved.reason).toContain('override measures 21 units');
  });

  it('ignores a blank override', () => {
    expect(resolveTransportTitle(episode, 'rednote', '   ').title).toBe(
      '聯準會的下一步',
    );
  });

  it('uses the trimmed canonical title for YouTube, ignoring variants', () => {
    expect(
      composeSocialContent('youtube', {
        copy,
        episode: {
          ...episode,
          title: ' A faithful English title ',
          titleVariants: { '100': { title: 'English variant', method: 'llm' } },
        },
      }).title,
    ).toBe('A faithful English title');
  });

  it('keeps a 100 code point YouTube title and rejects 101 or empty', () => {
    expect(
      resolveTransportTitle({ ...episode, title: '界'.repeat(100) }, 'youtube')
        .title,
    ).toBe('界'.repeat(100));
    expect(
      resolveTransportTitle({ ...episode, title: '界'.repeat(101) }, 'youtube'),
    ).toEqual({
      title: null,
      reason: 'YouTube title is 101 characters, over 100',
    });
    expect(
      resolveTransportTitle({ ...episode, title: '  ' }, 'youtube'),
    ).toEqual({ title: null, reason: 'YouTube title is empty' });
  });

  it('assembles YouTube metadata from the episode, preferring the article description', () => {
    expect(composeSocialContent('youtube', { copy, episode })).toEqual({
      title: '聯準會的下一步',
      body: '來源文章描述。\n\n更多市场洞察与工具：https://www.zap-pilot.org',
      hashtags: [],
      hookType: 'explainer',
    });

    expect(
      composeSocialContent('youtube', {
        copy,
        episode: { ...episode, description: '   ' },
      }).body,
    ).toBe('本集摘要。\n\n更多市场洞察与工具：https://www.zap-pilot.org');
  });

  it('truncates the YouTube description to 4500 and leaves an over-long title null', () => {
    const composed = composeSocialContent('youtube', {
      copy,
      episode: {
        title: `  ${'界'.repeat(120)}  `,
        summary: 'S'.repeat(5_000),
        description: '   ',
      },
    });
    expect(composed.title).toBeNull();
    expect(composed.body.split('\n\n')[0]).toBe('S'.repeat(4_500));
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

  it('rejects a missing platform copy block instead of composing empty content', () => {
    expect(() =>
      composeSocialContent('x', {
        copy: { ...copy, x: undefined },
        episode,
      }),
    ).toThrow('Generated social copy is missing the x block.');
  });

  it('rejects unsupported platform values at the exhaustive boundary', () => {
    expect(() =>
      composeSocialContent('mastodon' as never, { copy, episode }),
    ).toThrow('Unsupported social platform: mastodon');
  });

  it('fails closed when even the Threads CTA alone exceeds the post limit', () => {
    const oversizedUrl = `https://example.test/${'a'.repeat(600)}`;
    expect(() =>
      applyPlatformCta('threads', '正文', 'zh-Hant', oversizedUrl),
    ).toThrow('Threads CTA exceeds the post length limit');
  });
});
