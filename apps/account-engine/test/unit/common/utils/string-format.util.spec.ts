import {
  escapeHtml,
  truncateString,
} from '../../../../src/common/utils/string-format.util';

describe('escapeHtml', () => {
  it('escapes & to &amp;', () => {
    expect(escapeHtml('a&b')).toBe('a&amp;b');
  });

  it('escapes < to &lt;', () => {
    expect(escapeHtml('a<b')).toBe('a&lt;b');
  });

  it('escapes > to &gt;', () => {
    expect(escapeHtml('a>b')).toBe('a&gt;b');
  });

  it('escapes " to &quot;', () => {
    expect(escapeHtml('a"b')).toBe('a&quot;b');
  });

  it("escapes ' to &#x27;", () => {
    expect(escapeHtml("a'b")).toBe('a&#x27;b');
  });

  it('escapes / to &#x2F;', () => {
    expect(escapeHtml('a/b')).toBe('a&#x2F;b');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('leaves plain alphanumeric text untouched', () => {
    expect(escapeHtml('hello world 123')).toBe('hello world 123');
  });

  it('escapes all special chars in a mixed string simultaneously', () => {
    expect(escapeHtml('<script>alert("xss&\'test\'");</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&amp;&#x27;test&#x27;&quot;);&lt;&#x2F;script&gt;',
    );
  });
});

describe('truncateString', () => {
  it('returns the string unchanged when length is within maxLength', () => {
    expect(truncateString('hello', 10)).toBe('hello');
  });

  it('returns the string unchanged at exact boundary', () => {
    expect(truncateString('hello', 5)).toBe('hello');
  });

  it('truncates and appends ellipsis when string exceeds maxLength', () => {
    expect(truncateString('hello world', 8)).toBe('hello...');
  });

  it('works with minimum valid maxLength of 3', () => {
    expect(truncateString('abcde', 3)).toBe('...');
  });

  it('throws when maxLength is less than 3', () => {
    expect(() => truncateString('hello', 2)).toThrow(
      'maxLength must be at least 3',
    );
  });
});
