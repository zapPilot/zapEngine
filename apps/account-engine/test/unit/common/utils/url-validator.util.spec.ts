import { UrlValidator } from '@/common/utils/url-validator.util';

describe('UrlValidator.isValidHttpUrl', () => {
  it('returns true for an http:// URL', () => {
    expect(UrlValidator.isValidHttpUrl('http://example.com')).toBe(true);
  });

  it('returns true for an https:// URL', () => {
    expect(UrlValidator.isValidHttpUrl('https://example.com/path?q=1')).toBe(
      true,
    );
  });

  it('returns false for an ftp:// URL', () => {
    expect(UrlValidator.isValidHttpUrl('ftp://example.com')).toBe(false);
  });

  it('returns false for an invalid string', () => {
    expect(UrlValidator.isValidHttpUrl('not-a-url')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(UrlValidator.isValidHttpUrl('')).toBe(false);
  });
});

describe('UrlValidator.getOrigin', () => {
  it('returns protocol + host for a valid URL', () => {
    expect(UrlValidator.getOrigin('https://example.com:8080/path')).toBe(
      'https://example.com:8080',
    );
  });

  it('returns the original string for an invalid URL', () => {
    expect(UrlValidator.getOrigin('not-a-url')).toBe('not-a-url');
  });
});

describe('UrlValidator.normalizeLoopbackUrl', () => {
  it('replaces localhost with 127.0.0.1 for http', () => {
    expect(UrlValidator.normalizeLoopbackUrl('http://localhost')).toBe(
      'http://127.0.0.1',
    );
  });

  it('replaces localhost with 127.0.0.1 for https', () => {
    expect(UrlValidator.normalizeLoopbackUrl('https://localhost')).toBe(
      'https://127.0.0.1',
    );
  });

  it('preserves the port in the normalized URL', () => {
    expect(UrlValidator.normalizeLoopbackUrl('http://localhost:3000')).toBe(
      'http://127.0.0.1:3000',
    );
  });

  it('preserves pathname and query string', () => {
    expect(
      UrlValidator.normalizeLoopbackUrl('http://localhost:3000/api/v1?foo=bar'),
    ).toBe('http://127.0.0.1:3000/api/v1?foo=bar');
  });

  it('leaves non-localhost URLs unchanged', () => {
    expect(UrlValidator.normalizeLoopbackUrl('https://example.com')).toBe(
      'https://example.com',
    );
  });

  it('leaves non-http(s) schemes unchanged even for localhost', () => {
    expect(UrlValidator.normalizeLoopbackUrl('ws://localhost:4000')).toBe(
      'ws://localhost:4000',
    );
  });
});
