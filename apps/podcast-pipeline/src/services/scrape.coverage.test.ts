import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { extractArticleImageCandidates } from './scrape.js';

describe('extractArticleImageCandidates coverage', () => {
  it('ignores width and height metadata without content', () => {
    const dom = new JSDOM(`
      <head>
        <meta property="og:image" content="https://publisher.example/news/cover.jpg" />
        <meta property="og:image:width" />
        <meta property="og:image:height" />
      </head>
      <article><p>Body.</p></article>
    `);

    const candidates = extractArticleImageCandidates(
      dom.window.document,
      'https://publisher.example/news/story',
    );

    expect(candidates).toEqual([
      expect.objectContaining({
        imageUrl: 'https://publisher.example/news/cover.jpg',
      }),
    ]);
    expect(candidates[0]?.width).toBeUndefined();
    expect(candidates[0]?.height).toBeUndefined();
  });
});
