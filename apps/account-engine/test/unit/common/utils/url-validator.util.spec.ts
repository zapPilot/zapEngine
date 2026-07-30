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
