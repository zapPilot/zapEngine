import { describe, expect, it } from 'vitest';

import { isRednoteLoginUrl } from './account-snapshots.js';

describe('isRednoteLoginUrl route boundaries', () => {
  it('does not treat normal creator routes containing auth substrings as login pages', () => {
    expect(
      isRednoteLoginUrl('https://creator.rednote.com/new/author-center'),
    ).toBe(false);
    expect(isRednoteLoginUrl('https://creator.rednote.com/new/authority')).toBe(
      false,
    );
    expect(
      isRednoteLoginUrl('https://creator.rednote.com/login?from=author-center'),
    ).toBe(true);
  });
});
