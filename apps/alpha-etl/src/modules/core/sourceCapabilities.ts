import { DATA_SOURCES, type DataSource } from '../../types/index.js';

export interface SourceCapability {
  current: boolean;
  backfill: boolean;
}

const sourceCapabilities = {
  defillama: { current: true, backfill: false },
  debank: { current: true, backfill: false },
  hyperliquid: { current: true, backfill: false },
  feargreed: { current: true, backfill: false },
  'macro-fear-greed': { current: true, backfill: true },
  'token-price': { current: true, backfill: true },
  'stock-price': { current: true, backfill: false },
} as const satisfies Record<DataSource, SourceCapability>;

export const SOURCE_CAPABILITIES: Record<DataSource, SourceCapability> =
  sourceCapabilities;

export const DEFAULT_CURRENT_SOURCES: DataSource[] = DATA_SOURCES.filter(
  (source) => SOURCE_CAPABILITIES[source].current,
);
