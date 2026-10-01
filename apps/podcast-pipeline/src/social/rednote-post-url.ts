export function publicPostUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const publicHost =
      url.hostname === 'xiaohongshu.com' ||
      url.hostname === 'rednote.com' ||
      url.hostname.endsWith('.xiaohongshu.com') ||
      url.hostname.endsWith('.rednote.com');
    const publicPath = /^\/(?:explore|discovery\/item)\/[^/]+\/?$/.test(
      url.pathname,
    );
    return publicHost && publicPath ? url.href : null;
  } catch {
    return null;
  }
}
