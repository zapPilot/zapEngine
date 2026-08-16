import { describe, expect, it } from 'vitest';

import { contentTypeExtension } from './content-type.js';

describe('contentTypeExtension', () => {
  it.each([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/avif', 'avif'],
  ] as const)('maps %s to %s', (contentType, extension) => {
    expect(contentTypeExtension(contentType)).toBe(extension);
  });
});
