import { describe, expect, it } from 'vitest';

import { appendBrandCta } from '../brand/cta.js';
import { parseGeneratedSocialCopy, weightedTweetLength } from './copy.js';

describe('X local length trimming', () => {
  it('trims an overlong English body and preserves the complete CTA', () => {
    const copy = parseGeneratedSocialCopy(
      JSON.stringify({
        topic: 'technology',
        x: { hookType: 'explainer', text: 'A'.repeat(317) },
      }),
      'en',
      { x: true, threads: false, rednote: false, youtube: false },
    );

    expect(copy.x!.text).toBe('A'.repeat(247));

    const published = appendBrandCta(copy.x!.text, 'en');
    expect(published).toBe(
      `${'A'.repeat(247)}\n\nWebsite https://www.zap-pilot.org`,
    );
    expect(weightedTweetLength(published)).toBe(280);
  });
});
