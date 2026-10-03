export function clientIp(headers: Record<string, string | undefined>): string {
  return (
    headers['fly-client-ip'] ??
    headers['cf-connecting-ip'] ??
    headers['x-forwarded-for']?.split(',')[0]?.trim() ??
    'unknown'
  );
}
