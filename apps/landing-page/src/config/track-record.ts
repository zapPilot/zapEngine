// Absolute public gateways only. These values are both fetched from and
// rendered as links a reader can open to verify a CID against a third party, so
// a same-origin or relative entry would break the second use even where it
// works for the first. Each entry already carries the `/ipfs` path segment — a
// CID is appended directly. `config/env/*.env` documents the override vars in
// the same shape, so do not strip the suffix here without migrating those
// values first.
export const IPFS_GATEWAYS = [
  process.env['NEXT_PUBLIC_IPFS_GATEWAY'] ?? 'https://ipfs.io/ipfs',
  process.env['NEXT_PUBLIC_IPFS_GATEWAY_FALLBACK'] ?? 'https://dweb.link/ipfs',
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
