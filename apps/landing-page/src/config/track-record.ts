export const IPFS_GATEWAYS = [
  process.env['NEXT_PUBLIC_IPFS_GATEWAY'] ?? 'https://ipfs.io/ipfs',
  process.env['NEXT_PUBLIC_IPFS_GATEWAY_FALLBACK'] ??
    'https://cloudflare-ipfs.com/ipfs',
  'https://dweb.link/ipfs',
] as const;

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
  { href: '/track-record/positions', label: 'Positions' },
  { href: '/track-record/rebalances', label: 'Rebalances' },
  { href: '/track-record/verification', label: 'Verification' },
] as const;
