/**
 * String formatting utilities for safe HTML generation and text truncation
 */

/**
 * Escape HTML special characters to prevent XSS in email templates
 *
 * @param str - String to escape
 * @returns HTML-escaped string
 */
export function escapeHtml(str: string): string {
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };

  return str.replace(
    /[&<>"'/]/g,
    (char) =>
      /* istanbul ignore next -- regex guarantees match */ escapeMap[char] ??
      char,
  );
}

/**
 * Truncate a string to a maximum length, adding ellipsis if truncated
 *
 * @param str - String to truncate
 * @param maxLength - Maximum length (must be at least 3 to accommodate ellipsis)
 * @returns Truncated string with ellipsis if needed
 * @throws Error if maxLength is less than 3
 */
export function truncateString(str: string, maxLength: number): string {
  if (maxLength < 3) {
    throw new Error('maxLength must be at least 3');
  }

  if (str.length <= maxLength) {
    return str;
  }

  return str.substring(0, maxLength - 3) + '...';
}
