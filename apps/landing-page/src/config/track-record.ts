// Production uses the same-origin `/ipfs` path first. Vercel rewrites that
// path to a public IPFS gateway, so browsers never make the cross-origin request
// that previously failed CORS. The public values remain direct fallbacks for
// local development and for deployments that do not apply vercel.json.
export const IPFS_GATEWAYS = [
  '/ipfs',
  process.env['NEXT_PUBLIC_IPFS_GATEWAY'] ?? 'https://dweb.link/ipfs',
  process.env['NEXT_PUBLIC_IPFS_GATEWAY_FALLBACK'] ?? 'https://ipfs.io/ipfs',
] as const;

export function ipfsGatewayUrl(gateway: string, cid: string): string {
  return `${gateway.replace(/\/$/, '')}/${cid}`;
}

export const DEFAULT_HISTORY_LIMIT = 90;

export const CHART_DIMENSIONS = {
  width: 720,
  height: 320,
  padding: {
    top: 30,
    right: 34,
    bottom: 54,
    left: 56,
  },
} as const;

export const TABS = [
  { href: '/track-record', label: 'Overview' },
  { href: '/track-record/performance', label: 'Performance' },
  { href: '/track-record/signals', label: 'Signals' },
  { href: '/track-record/positions', label: 'Positions' },
  { href: '/track-record/rebalances', label: 'Rebalances' },
  { href: '/track-record/verification', label: 'Verification' },
] as const;
