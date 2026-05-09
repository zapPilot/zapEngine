import { HTTPException } from 'hono/http-exception';
import { describe, expect, it } from 'vitest';

function parseInputUrl(value: string): string {
  try {
    const url = new URL(value);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('URL must use http or https');
    }

    return url.toString();
  } catch {
    throw new HTTPException(400, { message: 'Invalid url' });
  }
}

describe('parseInputUrl', () => {
  it('accepts https URLs', () => {
    expect(parseInputUrl('https://example.com')).toBe('https://example.com/');
    expect(parseInputUrl('https://example.com/path')).toBe(
      'https://example.com/path',
    );
  });

  it('accepts http URLs', () => {
    expect(parseInputUrl('http://example.com')).toBe('http://example.com/');
  });

  it('throws HTTPException 400 for invalid url', () => {
    expect(() => parseInputUrl('')).toThrow(HTTPException);
    try {
      parseInputUrl('');
    } catch (e) {
      expect((e as HTTPException).status).toBe(400);
    }
  });

  it('throws HTTPException 400 for non-http protocols', () => {
    expect(() => parseInputUrl('ftp://example.com')).toThrow(HTTPException);
    try {
      parseInputUrl('ftp://example.com');
    } catch (e) {
      expect((e as HTTPException).status).toBe(400);
    }
  });

  it('throws HTTPException 400 for malformed url', () => {
    expect(() => parseInputUrl('not-a-url')).toThrow(HTTPException);
  });

  it('normalizes URL with trailing slash', () => {
    expect(parseInputUrl('https://example.com')).toBe('https://example.com/');
  });

  it('preserves query strings', () => {
    expect(parseInputUrl('https://example.com?q=1')).toBe(
      'https://example.com/?q=1',
    );
  });
});
