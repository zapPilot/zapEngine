export const IPFS_GATEWAYS = [
  process.env['NEXT_PUBLIC_IPFS_GATEWAY'] ?? 'https://ipfs.io/ipfs',
  process.env['NEXT_PUBLIC_IPFS_GATEWAY_FALLBACK'] ??
    'https://cloudflare-ipfs.com/ipfs',
  'https://dweb.link/ipfs',
] as const;

export const DEFAULT_HISTORY_LIMIT = 90;

export const CHART_COLORS = {
  strategy: '#d4c5a3',
  benchmark: '#2775ca',
  drawdown: 'rgba(212, 197, 163, 0.12)',
  gridLine: 'rgba(255, 255, 255, 0.065)',
  axis: 'rgba(255, 255, 255, 0.09)',
  text: 'var(--ink-faint)',
  accent: 'var(--accent)',
} as const;

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
