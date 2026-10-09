import { describe, expect, it } from 'vitest';

import { socialSignOff } from '../brand/cta.js';
import { parseGeneratedSocialCopy } from './copy.js';
import { applyPlatformCta } from './platforms.js';
import { weightedTweetLength } from './x-text.js';

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

    expect(copy.x!.text).toBe('A'.repeat(205));

    const published = applyPlatformCta('x', copy.x!.text, 'en');
    expect(published).toBe(`${'A'.repeat(205)}\n\n${socialSignOff('en')}`);
    expect(weightedTweetLength(published)).toBe(280);
  });
});
