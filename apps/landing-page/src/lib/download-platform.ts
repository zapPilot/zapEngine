export type DownloadPlatform = 'android' | 'ios' | 'mac' | 'other';
export type DownloadTarget = 'mac' | 'appStore' | 'googlePlay';
export function detectDownloadPlatform(input: {
  userAgent?: unknown;
  maxTouchPoints?: unknown;
  userAgentDataPlatform?: unknown;
}): DownloadPlatform {
  const { userAgent, maxTouchPoints, userAgentDataPlatform } = input;
  if (typeof userAgent !== 'string' || !userAgent) return 'other';
  if (/Android/i.test(userAgent)) return 'android';
  if (
    /iPhone|iPad|iPod/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) &&
      typeof maxTouchPoints === 'number' &&
      maxTouchPoints > 1)
  )
    return 'ios';
  if (
    /Macintosh|Mac OS X/i.test(userAgent) ||
    userAgentDataPlatform === 'macOS'
  )
    return 'mac';
  return 'other';
}
export function resolveDownloadOptions(
  platform: DownloadPlatform,
  availability: Record<DownloadTarget, boolean>,
): { primary?: DownloadTarget; all: DownloadTarget[] } {
  const all = (['mac', 'appStore', 'googlePlay'] as const).filter(
    (target) => availability[target],
  );
  const target =
    platform === 'mac'
      ? 'mac'
      : platform === 'ios'
        ? 'appStore'
        : platform === 'android'
          ? 'googlePlay'
          : undefined;
  return {
    ...(target && availability[target] ? { primary: target } : {}),
    all,
  };
}
