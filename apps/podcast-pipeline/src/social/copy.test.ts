import { describe, expect, it } from 'vitest';

import { parseGeneratedSocialCopy } from './copy.js';

describe('parseGeneratedSocialCopy', () => {
  it('accepts valid structured copy and strips hashtag prefixes', () => {
    const copy = parseGeneratedSocialCopy(
      JSON.stringify({
        hook: '真正被重新定價的可能是 Fed',
        x: { text: 'ETH 這波可能不是在交易 crypto narrative。' },
        rednote: {
          title: 'ETH到底在漲什麼？',
          body: '大家都在看 ETH，但這集真正想拆的是背後的利率與流動性脈絡。',
          hashtags: ['#以太坊', '美聯儲', '#投資'],
        },
      }),
    );

    expect(copy.rednote.hashtags).toEqual(['以太坊', '美聯儲', '投資']);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseGeneratedSocialCopy('{bad json')).toThrow();
  });

  it('rejects a missing Rednote title', () => {
    expect(() =>
      parseGeneratedSocialCopy(
        JSON.stringify({
          hook: 'hook',
          x: { text: 'x copy' },
          rednote: { body: 'body', hashtags: ['a', 'b', 'c'] },
        }),
      ),
    ).toThrow();
  });

  it('rejects empty copy', () => {
    expect(() =>
      parseGeneratedSocialCopy(
        JSON.stringify({
          hook: 'hook',
          x: { text: '' },
          rednote: { title: 'title', body: 'body', hashtags: ['a', 'b', 'c'] },
        }),
      ),
    ).toThrow();
  });
});
