export function isPanewsHostname(hostname: string): boolean {
  let host = hostname.toLowerCase();
  while (host.endsWith('.')) host = host.slice(0, -1);
  return ['panews.io', 'panewslab.com'].some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}
