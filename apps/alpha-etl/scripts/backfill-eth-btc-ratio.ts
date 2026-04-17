#!/usr/bin/env tsx

/**
 * One-off backfill script for ETH/BTC ratio vs 200 DMA.
 *
 * Usage:
 *   cd alpha-etl
 *   npx tsx scripts/backfill-eth-btc-ratio.ts
 *   or
 *   npm run backfill:eth-btc-ratio
 */

import type { Pool } from "pg";
import { getDbPool, getTableName } from "../src/config/database.js";
import { TokenPriceDmaService } from "../src/modules/token-price/dmaService.js";
import { toErrorMessage } from "../src/utils/errors.js";

const SOURCE = "coingecko";
const REQUIRED_TOKENS = ["ETH", "BTC"] as const;
const DIVIDER = "═══════════════════════════════════════════════════════════";

function printHeader(): void {
  console.log(DIVIDER);
  console.log("  ETH/BTC Ratio DMA200 Backfill");
  console.log(`${DIVIDER}\n`);
}

async function ensureRatioTableExists(pool: Pool): Promise<void> {
  const ratioTable = getTableName("TOKEN_PAIR_RATIO_DMA_SNAPSHOTS");
  const result = await pool.query<{ table_name: string | null }>(
    "SELECT to_regclass($1) AS table_name",
    [ratioTable],
  );

  if (result.rows[0]?.table_name) {
    return;
  }

  throw new Error(
    `Target table ${ratioTable} does not exist. Apply migration 012_create_token_pair_ratio_dma_snapshots.sql first.`,
  );
}

async function getSourceRowCounts(
  pool: Pool,
): Promise<Record<(typeof REQUIRED_TOKENS)[number], number>> {
  const priceTable = getTableName("TOKEN_PRICE_SNAPSHOTS");
  const result = await pool.query<{ token_symbol: string; row_count: string }>(
    `
      SELECT token_symbol, COUNT(*)::text AS row_count
      FROM ${priceTable}
      WHERE source = $1
        AND token_symbol = ANY($2::text[])
      GROUP BY token_symbol
    `,
    [SOURCE, REQUIRED_TOKENS],
  );

  const counts: Record<(typeof REQUIRED_TOKENS)[number], number> = {
    ETH: 0,
    BTC: 0,
  };

  for (const row of result.rows) {
    const tokenSymbol = row.token_symbol as (typeof REQUIRED_TOKENS)[number];
    if (tokenSymbol in counts) {
      counts[tokenSymbol] = Number(row.row_count);
    }
  }

  return counts;
}

function assertRequiredSourceRows(
  counts: Record<(typeof REQUIRED_TOKENS)[number], number>,
): void {
  const missingTokens = REQUIRED_TOKENS.filter((token) => counts[token] <= 0);
  if (missingTokens.length === 0) {
    return;
  }

  throw new Error(
    `Missing required token price history for ${missingTokens.join(", ")} in ${getTableName("TOKEN_PRICE_SNAPSHOTS")}.`,
  );
}

function printPreflightSummary(
  counts: Record<(typeof REQUIRED_TOKENS)[number], number>,
): void {
  console.log("Preflight checks passed.\n");
  console.log(`Source table: ${getTableName("TOKEN_PRICE_SNAPSHOTS")}`);
  console.log(
    `Target table: ${getTableName("TOKEN_PAIR_RATIO_DMA_SNAPSHOTS")}`,
  );
  console.log(`ETH source rows: ${counts.ETH}`);
  console.log(`BTC source rows: ${counts.BTC}\n`);
}

async function runBackfill(pool: Pool): Promise<number> {
  const service = new TokenPriceDmaService(pool);
  const jobId = `manual-backfill-eth-btc-ratio-${Date.now()}`;

  console.log(
    `Running full ETH/BTC ratio DMA recompute with jobId=${jobId}...\n`,
  );

  const result = await service.updateEthBtcRatioDma(jobId);
  return result.recordsInserted;
}

async function main(): Promise<void> {
  printHeader();

  const pool = getDbPool();

  try {
    await ensureRatioTableExists(pool);
    const counts = await getSourceRowCounts(pool);
    assertRequiredSourceRows(counts);
    printPreflightSummary(counts);

    const recordsInserted = await runBackfill(pool);

    console.log("Backfill completed successfully.\n");
    console.log(`Rows inserted/upserted: ${recordsInserted}`);
    console.log(
      `Target table: ${getTableName("TOKEN_PAIR_RATIO_DMA_SNAPSHOTS")}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("\nETH/BTC ratio DMA backfill failed.");
  console.error(toErrorMessage(error));
  process.exit(1);
});
