import type { BaseETLProcessor } from '../../core/processors/baseETLProcessor.js';
import { HyperliquidVaultETLProcessor } from '../../modules/hyperliquid/processor.js';
import { MacroFearGreedETLProcessor } from '../../modules/macro-fear-greed/processor.js';
import { PoolETLProcessor } from '../../modules/pool/processor.js';
import { SentimentETLProcessor } from '../../modules/sentiment/processor.js';
import { StockPriceETLProcessor } from '../../modules/stock-price/processor.js';
import { TokenPriceETLProcessor } from '../../modules/token-price/processor.js';
import { WalletBalanceETLProcessor } from '../../modules/wallet/processor.js';
import type { DataSource } from '../../types/index.js';

export type ProcessorConstructor = new () => BaseETLProcessor;

export const PROCESSOR_REGISTRY: Record<DataSource, ProcessorConstructor> = {
  defillama: PoolETLProcessor,
  debank: WalletBalanceETLProcessor,
  hyperliquid: HyperliquidVaultETLProcessor,
  feargreed: SentimentETLProcessor,
  'macro-fear-greed': MacroFearGreedETLProcessor,
  'token-price': TokenPriceETLProcessor,
  'stock-price': StockPriceETLProcessor,
} as const;
