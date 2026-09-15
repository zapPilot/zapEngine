import {
  getOrigin,
  normalizeLoopbackUrl,
} from '../../../../src/common/utils/url-validator.util';

describe('getOrigin', () => {
  it('returns protocol + host for a valid URL', () => {
    expect(getOrigin('https://example.com:8080/path')).toBe(
      'https://example.com:8080',
    );
  });

  it('returns the original string for an invalid URL', () => {
    expect(getOrigin('not-a-url')).toBe('not-a-url');
  });
});

describe('normalizeLoopbackUrl', () => {
  it('replaces localhost with 127.0.0.1 for http', () => {
    expect(normalizeLoopbackUrl('http://localhost')).toBe('http://127.0.0.1');
  });

  it('replaces localhost with 127.0.0.1 for https', () => {
    expect(normalizeLoopbackUrl('https://localhost')).toBe('https://127.0.0.1');
  });

  it('preserves the port in the normalized URL', () => {
    expect(normalizeLoopbackUrl('http://localhost:3000')).toBe(
      'http://127.0.0.1:3000',
    );
  });

  it('preserves pathname and query string', () => {
    expect(normalizeLoopbackUrl('http://localhost:3000/api/v1?foo=bar')).toBe(
      'http://127.0.0.1:3000/api/v1?foo=bar',
    );
  });

  it('leaves non-localhost URLs unchanged', () => {
    expect(normalizeLoopbackUrl('https://example.com')).toBe(
      'https://example.com',
    );
  });

  it('leaves non-http(s) schemes unchanged even for localhost', () => {
    expect(normalizeLoopbackUrl('ws://localhost:4000')).toBe(
      'ws://localhost:4000',
    );
  });
});

describe('normalizeLoopbackUrl unparseable fallbacks', () => {
  // Each test names the previously-uncovered branch it locks.
  // mutation: not run (offline sandbox — vitest could not be executed here).

  it('normalizes a localhost URL the URL parser rejects', () => {
    // Locks: normalizeLoopbackUrl catch branch with a localhost regex match,
    // including the `replace` callback (previously-uncovered function).
    // eslint-disable-next-line sonarjs/no-clear-text-protocols -- loopback normalization subject requires http
    expect(normalizeLoopbackUrl('http://localhost:99999/path')).toBe(
      // eslint-disable-next-line sonarjs/no-clear-text-protocols -- expected loopback output requires http
      'http://127.0.0.1:99999/path',
    );
  });

  it('returns an unparseable non-localhost string unchanged', () => {
    // Locks: catch branch with regex miss (`return url`).
    // eslint-disable-next-line sonarjs/no-clear-text-protocols -- unparseable input subject requires http
    expect(normalizeLoopbackUrl('http://:99999')).toBe('http://:99999');
  });
});
