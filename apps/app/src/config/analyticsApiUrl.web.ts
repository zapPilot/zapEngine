export function resolveAnalyticsApiUrl(url: string | undefined) {
  if (typeof window === 'undefined') return url;
  const bridge = (
    window as Window & {
      zapDesktop?: { platform?: string; analyticsProxyPath?: string };
    }
  ).zapDesktop;
  if (
    bridge?.platform === 'electron' &&
    bridge.analyticsProxyPath === '/__zap/analytics' &&
    window.location.protocol === 'http:' &&
    window.location.hostname === '127.0.0.1'
  ) {
    return `${window.location.origin}${bridge.analyticsProxyPath}`;
  }
  return url;
}
