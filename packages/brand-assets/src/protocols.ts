export type ProtocolBrandKey =
  | 'morpho'
  | 'gmx-v2'
  | 'hyperliquid'
  | 'ondo'
  | 'aave'
  | 'lido'
  | 'eth-staking';

export interface ProtocolBrand {
  readonly label: string;
  readonly color: string;
}

export const PROTOCOL_BRAND: Record<ProtocolBrandKey, ProtocolBrand> = {
  morpho: { label: 'Morpho', color: '#2470ff' },
  'gmx-v2': { label: 'GMX', color: '#4e09f8' },
  hyperliquid: { label: 'Hyperliquid', color: '#50d2c1' },
  ondo: { label: 'Ondo', color: '#f4f4f5' },
  aave: { label: 'Aave', color: '#9896ff' },
  lido: { label: 'Lido', color: '#00a3ff' },
  'eth-staking': { label: 'ETH Staking', color: '#627eea' },
};

const PROTOCOL_BRAND_KEY_ALIASES: Record<string, ProtocolBrandKey> = {
  gmx: 'gmx-v2',
  gmxv2: 'gmx-v2',
  'gmx-v-2': 'gmx-v2',
  'aave-v2': 'aave',
  'aave-v3': 'aave',
  'morpho-blue': 'morpho',
  'ondo-finance': 'ondo',
  'lido-finance': 'lido',
  hlp: 'hyperliquid',
  'hyperliquid-hlp': 'hyperliquid',
  hypercore: 'hyperliquid',
};

function normalizeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-');
}

export function protocolBrandKeyFor(raw: string): ProtocolBrandKey | undefined {
  const normalized = normalizeKey(raw);
  if (normalized in PROTOCOL_BRAND) {
    return normalized as ProtocolBrandKey;
  }
  return PROTOCOL_BRAND_KEY_ALIASES[normalized];
}
