#!/usr/bin/env tsx

/**
 * One-off backfill script for S&P500 (SPY) price history.
 *
 * Fetches 20+ years of historical data from Yahoo Finance
 * and computes 200-DMA after the data is ingested.
 *
 * Usage:
 *   pnpm --filter @zapengine/alpha-etl run backfill:sp500
 */

import { getDbPool } from '../src/config/database.js';
import { StockPriceETLProcessor } from '../src/modules/stock-price/processor.js';

const DIVIDER = '═══════════════════════════════════════════════════════════';

function printHeader(): void {
  console.log(DIVIDER);
  console.log('  S&P500 (SPY) Price Backfill');
  console.log(`${DIVIDER}\n`);
}

async function main(): Promise<void> {
  printHeader();

  const pool = getDbPool();
  const processor = new StockPriceETLProcessor(pool);

  console.log('Fetching full SPY history from Yahoo Finance...');
  console.log('(This may take a moment - 20+ years of data)\n');

  try {
    const result = await processor.backfillHistory(365 * 5, 'SPY');

    console.log('\n--- Results ---');
    console.log(`Requested: ${result.requested} days`);
    console.log(`Fetched: ${result.fetched} records`);
    console.log(`Inserted: ${result.inserted} records`);

    if (result.inserted > 0) {
      console.log('\nComputing 200-DMA...');
      const dmaResult = await processor.updateDmaForSymbol('SPY', 'backfill');
      console.log(`DMA records computed: ${dmaResult.recordsInserted}`);
      console.log('\n✓ Backfill completed successfully!');
    } else {
      console.log('\n⚠ No new data inserted (may already exist in DB)');
    }
  } catch (error) {
    console.error('\n✕ Backfill failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
