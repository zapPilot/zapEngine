import { describe, expect, it } from 'vitest';

import { parseOperationalFingerprint } from './fingerprint.js';

describe('parseOperationalFingerprint branches', () => {
  it('trims surrounding whitespace inside a valid fingerprint', () => {
    expect(parseOperationalFingerprint('  fly:app/my-app  ')).toEqual({
      source: 'fly',
      kind: 'app',
      key: 'my-app',
    });
  });

  it.each([
    ':kind/key',
    'source:/key',
    'source:kind/',
    'source:kind/   ',
    '   :kind/key',
    'source:   /key',
  ])('rejects blank source, kind, or key: %s', (fingerprint) => {
    expect(parseOperationalFingerprint(fingerprint)).toBeNull();
  });

  it('rejects a missing slash boundary', () => {
    expect(parseOperationalFingerprint('sentry:issues')).toBeNull();
  });
});
