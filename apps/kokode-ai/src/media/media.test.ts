import { describe, expect, it } from 'vitest';
import { artifacts, MEDIA_BASE, RENDER_COMMAND } from './artifacts';
import { expectedFingerprints } from './fingerprints';
import { published } from './published';
import { validatePublished } from './validate';
const expected = expectedFingerprints();
const fixture = () => ({
  release: '20261005-000000-12345678',
  artifacts: Object.fromEntries(
    Object.entries(artifacts).map(([id, spec]) => [
      id,
      {
        url: `${MEDIA_BASE}/releases/20261005-000000-12345678/${spec.object}`,
        fingerprint: expected[id],
        sha256: 'a'.repeat(64),
        bytes: 12,
        contentType: spec.contentType,
        renderedAt: '2026-10-05T00:00:00.000Z',
        sourceCommit: 'a'.repeat(40),
      },
    ]),
  ),
});
describe('published sales artifacts', () => {
  it('requires the committed release to match current copy', () => {
    expect(() => validatePublished(published, expected)).not.toThrow();
  });
  it('accepts a complete current release', () => {
    expect(validatePublished(fixture(), expected).release).toBeTruthy();
  });
  it.each([
    'missing',
    'extra',
    'origin',
    'path',
    'hash',
    'fingerprint',
    'type',
    'release',
    'query',
  ])('rejects %s with a render command', (failure) => {
    const value = fixture();
    const entry = value.artifacts['film.ja']!;
    if (failure === 'missing') delete value.artifacts['film.ja'];
    if (failure === 'extra') value.artifacts.extra = entry;
    if (failure === 'origin')
      entry.url = entry.url.replace(MEDIA_BASE, 'https://example.com');
    if (failure === 'path') entry.url = `${MEDIA_BASE}/film.mp4`;
    if (failure === 'hash') entry.sha256 = 'bad';
    if (failure === 'fingerprint') entry.fingerprint = 'b'.repeat(64);
    if (failure === 'type') entry.contentType = 'image/jpeg';
    if (failure === 'release') value.release = 'bad';
    if (failure === 'query') entry.url += '?x=1';
    expect(() => validatePublished(value, expected)).toThrow(RENDER_COMMAND);
  });
});
