import { SLOGAN } from '@zapengine/zap-pilot-story/brand';
import { expect, it } from 'vitest';

import { socialLandingUrl } from '../brand/cta.js';
import { parseGeneratedSocialCopy } from './copy.js';
import { applyPlatformCta } from './platforms.js';
import { weightedTweetLength } from './x-text.js';
it('reserves 78 Japanese X units for the canonical signature and attributed URL', () => {
  const raw = JSON.stringify({
    topic: 'technology',
    x: { hookType: 'explainer', text: 'あ'.repeat(200) },
  });
  const copy = parseGeneratedSocialCopy(raw, 'ja', {
    x: true,
    threads: false,
    rednote: false,
    youtube: false,
  });
  expect(weightedTweetLength(copy.x!.text)).toBe(202);
  const published = applyPlatformCta('x', copy.x!.text, 'ja');
  expect(published).toContain(SLOGAN);
  expect(weightedTweetLength(published)).toBe(280);
});
it('preserves legacy bodies and falls back to the original CTA when the new signature cannot fit', () => {
  const x = 'あ'.repeat(122);
  const published = applyPlatformCta('x', x, 'ja');
  expect(published).toBe(`${x}\n\n公式サイト https://www.zap-pilot.org`);
  expect(weightedTweetLength(published)).toBe(280);
  const threads = '中'.repeat(430);
  expect(applyPlatformCta('threads', threads)).toBe(
    `${threads}\n\n官網 https://www.zap-pilot.org`,
  );
  expect(() => applyPlatformCta('x', 'あ'.repeat(200), 'ja')).toThrow(
    'legacy body',
  );
  expect(applyPlatformCta('rednote', '正文')).toBe('正文');
  expect(applyPlatformCta('threads', '')).toContain(SLOGAN);
});
it('rejects generated slogans and budgets Threads against its actual attributed URL', () => {
  const blocks = { x: false, threads: true, rednote: false, youtube: false };
  const raw = (text: string) =>
    JSON.stringify({
      topic: 'technology',
      threads: { hookType: 'explainer', text },
    });
  expect(() =>
    parseGeneratedSocialCopy(raw(`正文 ${SLOGAN}`), 'zh-Hant', blocks),
  ).toThrow('Brand slogan');
  const episodeId = '00000000-0000-4000-8000-000000000000';
  const copy = parseGeneratedSocialCopy(
    raw('中'.repeat(320)),
    'zh-Hant',
    blocks,
    episodeId,
  );
  const url = socialLandingUrl({
    episodeId,
    platform: 'threads',
    languageCode: 'zh-Hant',
  });
  expect(
    Array.from(applyPlatformCta('threads', copy.threads!.text, 'zh-Hant', url))
      .length,
  ).toBeLessThanOrEqual(500);
  expect(() =>
    parseGeneratedSocialCopy(
      raw('中'.repeat(321)),
      'zh-Hant',
      blocks,
      episodeId,
    ),
  ).toThrow('maximum');
});

it('rejects a generated slogan carried in a Rednote hashtag', () => {
  const raw = JSON.stringify({
    topic: 'technology',
    rednote: {
      hookType: 'explainer',
      body: 'Market context.',
      hashtags: ['Your strategy Your machine Your wallet', 'market', 'finance'],
    },
  });
  expect(() =>
    parseGeneratedSocialCopy(raw, 'en', {
      x: false,
      threads: false,
      rednote: true,
      youtube: false,
    }),
  ).toThrow('Brand slogan');
});
it.each(['x', 'threads', 'rednote'] as const)(
  'rejects generated multiline, punctuated and full-width slogans in %s',
  (platform) => {
    for (const slogan of [
      'Your strategy.\nYour machine.\nYour wallet.',
      'Your strategy,\nyour machine,\nyour wallet',
      'Your strategy. Your machine. Your wallet',
      'Your strategy; your machine; your wallet.',
      'Your strategy — your machine — your wallet.',
      'Ｙｏｕｒ ｓｔｒａｔｅｇｙ． Ｙｏｕｒ ｍａｃｈｉｎｅ． Ｙｏｕｒ ｗａｌｌｅｔ．',
    ]) {
      const text = `Market context. Market context. Market context. Market context. ${slogan}`;
      const block =
        platform === 'rednote'
          ? { body: text, hashtags: ['market', 'technology', 'finance'] }
          : { text };
      const raw = JSON.stringify({
        topic: 'technology',
        [platform]: { hookType: 'explainer', ...block },
      });
      const blocks = {
        x: platform === 'x',
        threads: platform === 'threads',
        rednote: platform === 'rednote',
        youtube: false,
      };
      expect(() => parseGeneratedSocialCopy(raw, 'en', blocks)).toThrow(
        'Brand slogan',
      );
    }
  },
);
