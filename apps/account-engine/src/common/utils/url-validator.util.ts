/**
 * URL validation utilities
 */
export class UrlValidator {
  /**
   * Validate if URL uses HTTP or HTTPS protocol
   * @param url - URL to validate
   * @returns True if HTTP/HTTPS protocol, false otherwise
   */
  static isValidHttpUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Extract origin (protocol + hostname + port) from URL
   * @param url - URL to parse
   * @returns Origin or original string if invalid
   */
  static getOrigin(url: string): string {
    try {
      return new URL(url).origin;
    } catch {
      return url;
    }
  }

  /**
   * Normalize local loopback URLs onto the IPv4 path to avoid slow localhost resolution.
   * Leaves non-HTTP(S) URLs and non-localhost hosts unchanged.
   *
   * @param url - URL to normalize
   * @returns URL with localhost replaced by 127.0.0.1 when applicable
   */
  static normalizeLoopbackUrl(url: string): string {
    try {
      const parsedUrl = new URL(url);
      if (
        (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') ||
        parsedUrl.hostname !== 'localhost'
      ) {
        return url;
      }

      const portSuffix = parsedUrl.port ? `:${parsedUrl.port}` : '';
      const normalizedOrigin = `${parsedUrl.protocol}//127.0.0.1${portSuffix}`;
      const suffix =
        parsedUrl.pathname === '/' &&
        parsedUrl.search.length === 0 &&
        parsedUrl.hash.length === 0
          ? ''
          : `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;

      return normalizedOrigin + suffix;
    } catch {
      if (/^https?:\/\/localhost(?=[:/?#]|$)/.test(url)) {
        return url.replace(
          /^((?:http|https):\/\/)localhost(?=[:/?#]|$)/,
          (_match, prefix: string) => `${prefix}127.0.0.1`,
        );
      }

      return url;
    }
  }
}
