const DEFAULT_TELEGRAM_SOURCE_HOSTS = ['panews.io', 'panewslab.com'] as const;

export const TELEGRAM_UNSUPPORTED_SOURCE_TEXT =
  '目前只支援 PANews 文章網址（panews.io / panewslab.com）';

export function isAllowedTelegramSourceUrl(value: string): boolean {
  let hostname: string;
  try {
    hostname = normalizeHostname(new URL(value).hostname);
  } catch {
    return false;
  }

  return getAllowedTelegramSourceHosts().some((allowedHost) =>
    matchesHostname(hostname, allowedHost),
  );
}

function getAllowedTelegramSourceHosts(): string[] {
  const configured = process.env['PIPELINE_TELEGRAM_ALLOWED_SOURCE_HOSTS']
    ?.split(',')
    .map(normalizeHostname)
    .filter(Boolean);

  return configured?.length
    ? [...DEFAULT_TELEGRAM_SOURCE_HOSTS, ...configured]
    : [...DEFAULT_TELEGRAM_SOURCE_HOSTS];
}

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

function matchesHostname(hostname: string, allowedHost: string): boolean {
  return hostname === allowedHost || hostname.endsWith(`.${allowedHost}`);
}
