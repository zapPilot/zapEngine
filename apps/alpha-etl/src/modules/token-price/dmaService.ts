/**
 * Token Price DMA Service
 *
 * Computes 200-day simple moving average (SMA) from existing token price data.
 * Reads from token_price_snapshots, computes DMA, writes to token_price_dma_snapshots.
 *
 * This is a "derived data" service — it reads from the database rather than an external API.
 * Called as a post-step by TokenPriceETLProcessor after fresh prices are written.
 *
 * Data Source: alpha_raw.token_price_snapshots (internal)
 * Target: alpha_raw.token_price_dma_snapshots
 */

import { Pool } from "pg";
import { logger } from "../../utils/logger.js";
import { getDbPool, getTableName } from "../../config/database.js";
import { TokenPriceDmaWriter } from "../../modules/token-price/dmaWriter.js";
import { TokenPairRatioDmaWriter } from "../../modules/token-price/ratioDmaWriter.js";
import type {
  TokenPairRatioDmaSnapshotInsert,
  TokenPriceDmaSnapshotInsert,
} from "../../types/database.js";
import {
  buildAlignedPairRatioSeries,
  computeDma,
  computeTokenPairRatioDma,
  DMA_SOURCE,
  DMA_WINDOW_SIZE,
  ETH_BTC_RATIO_CONTEXT,
  type PairRatioContext,
  type PriceRow,
} from "./dmaCalculator.js";

export {
  buildAlignedPairRatioSeries,
  computeDma,
  computeTokenPairRatioDma,
} from "./dmaCalculator.js";

interface TokenContext {
  tokenSymbol: string;
  tokenId: string;
}

/**
 * Token Price DMA Service
 *
 * Computes 200-day SMA for token prices as a derived enrichment step:
 * 1. Fetch full history for a single token from token_price_snapshots
 * 2. Compute 200-day SMA for each date
 * 3. Upsert DMA snapshots for all dates to keep derived metrics current
 */
export class TokenPriceDmaService {
  private pool: Pool;
  private writer: TokenPriceDmaWriter;
  private ratioWriter: TokenPairRatioDmaWriter;

  constructor(pool?: Pool) {
    this.pool = pool ?? getDbPool();
    this.writer = new TokenPriceDmaWriter();
    this.ratioWriter = new TokenPairRatioDmaWriter();
  }

  /**
   * Update DMA snapshots for a single token after fresh price data has been written.
   *
   * Reads full token history, computes 200 DMA and upserts snapshots for all dates.
   * Upsert behavior guarantees same-day reruns refresh the derived DMA row.
   *
   * @param tokenSymbol - Token symbol (e.g., BTC)
   * @param tokenId - CoinGecko token id (e.g., bitcoin)
   * @param jobId - Optional parent job ID for log correlation
   * @returns Number of DMA rows inserted/updated
   */
  async updateDmaForToken(
    tokenSymbol: string,
    tokenId: string,
    jobId?: string,
  ): Promise<{ recordsInserted: number }> {
    const tokenContext = this.normalizeTokenContext(tokenSymbol, tokenId);
    const correlationId = this.resolveCorrelationId(
      tokenContext.tokenSymbol,
      jobId,
    );

    logger.info("Starting DMA computation post-step", {
      jobId: correlationId,
      tokenSymbol: tokenContext.tokenSymbol,
      tokenId: tokenContext.tokenId,
    });

    const prices = await this.fetchPricesForToken(
      tokenContext.tokenSymbol,
      tokenContext.tokenId,
    );
    if (prices.length === 0) {
      logger.info("No price history found for DMA computation", {
        jobId: correlationId,
        tokenSymbol: tokenContext.tokenSymbol,
        tokenId: tokenContext.tokenId,
      });
      return { recordsInserted: 0 };
    }

    const writeResult = await this.computeAndWriteDma(
      prices,
      correlationId,
      tokenContext.tokenSymbol,
    );

    logger.info("DMA computation post-step completed", {
      jobId: correlationId,
      tokenSymbol: tokenContext.tokenSymbol,
      recordsInserted: writeResult.recordsInserted,
    });

    return { recordsInserted: writeResult.recordsInserted };
  }

  /**
   * Get the latest DMA snapshot for a given token.
   * Delegates to the writer's database query.
   */
  async getLatestDmaSnapshot(tokenSymbol: string): Promise<{
    date: string;
    price: number;
    dma200: number | null;
    isAboveDma: boolean | null;
  } | null> {
    return this.writer.getLatestDmaSnapshot(tokenSymbol);
  }

  /**
   * Update ETH/BTC pair-ratio DMA snapshots after BTC or ETH price/DMA changes.
   */
  async updateEthBtcRatioDma(
    jobId?: string,
  ): Promise<{ recordsInserted: number }> {
    const correlationId = this.resolvePairCorrelationId(
      ETH_BTC_RATIO_CONTEXT,
      jobId,
    );

    logger.info("Starting pair ratio DMA computation post-step", {
      jobId: correlationId,
      baseTokenSymbol: ETH_BTC_RATIO_CONTEXT.baseTokenSymbol,
      quoteTokenSymbol: ETH_BTC_RATIO_CONTEXT.quoteTokenSymbol,
    });

    const [basePrices, quotePrices] = await Promise.all([
      this.fetchPricesForToken(
        ETH_BTC_RATIO_CONTEXT.baseTokenSymbol,
        ETH_BTC_RATIO_CONTEXT.baseTokenId,
      ),
      this.fetchPricesForToken(
        ETH_BTC_RATIO_CONTEXT.quoteTokenSymbol,
        ETH_BTC_RATIO_CONTEXT.quoteTokenId,
      ),
    ]);

    if (basePrices.length === 0 || quotePrices.length === 0) {
      logger.info(
        "Insufficient price history found for pair ratio DMA computation",
        {
          jobId: correlationId,
          baseTokenRows: basePrices.length,
          quoteTokenRows: quotePrices.length,
        },
      );
      return { recordsInserted: 0 };
    }

    const ratioPrices = buildAlignedPairRatioSeries(
      basePrices,
      quotePrices,
      ETH_BTC_RATIO_CONTEXT,
    );

    if (ratioPrices.length === 0) {
      logger.info(
        "No overlapping price history found for pair ratio DMA computation",
        {
          jobId: correlationId,
          baseTokenSymbol: ETH_BTC_RATIO_CONTEXT.baseTokenSymbol,
          quoteTokenSymbol: ETH_BTC_RATIO_CONTEXT.quoteTokenSymbol,
        },
      );
      return { recordsInserted: 0 };
    }

    const ratioSnapshots = computeTokenPairRatioDma(
      ratioPrices,
      DMA_WINDOW_SIZE,
    );
    const writeResult = await this.writeRatioDmaSnapshots(
      ratioSnapshots,
      correlationId,
      ETH_BTC_RATIO_CONTEXT,
    );

    logger.info("Pair ratio DMA computation post-step completed", {
      jobId: correlationId,
      baseTokenSymbol: ETH_BTC_RATIO_CONTEXT.baseTokenSymbol,
      quoteTokenSymbol: ETH_BTC_RATIO_CONTEXT.quoteTokenSymbol,
      recordsInserted: writeResult.recordsInserted,
    });

    return writeResult;
  }

  /**
   * Fetch full price history for one token from the source table.
   * Retrieves prices ordered by date ascending (required for SMA computation).
   */
  private async fetchPricesForToken(
    tokenSymbol: string,
    tokenId: string,
  ): Promise<PriceRow[]> {
    const query = `
      SELECT token_symbol, token_id,
             to_char(snapshot_date, 'YYYY-MM-DD') as snapshot_date,
             price_usd
      FROM ${getTableName("TOKEN_PRICE_SNAPSHOTS")}
      WHERE source = $1
        AND token_symbol = $2
        AND lower(token_id) = lower($3)
      ORDER BY snapshot_date ASC
    `;

    const result = await this.pool.query(query, [
      DMA_SOURCE,
      tokenSymbol,
      tokenId,
    ]);

    const rows = result.rows.map((row) => this.mapPriceRow(row));

    logger.info("Fetched price history for DMA computation", {
      tokenSymbol,
      tokenId,
      rowCount: rows.length,
    });

    return rows;
  }

  /**
   * Write DMA snapshots via the writer
   */
  private async writeDmaSnapshots(
    snapshots: TokenPriceDmaSnapshotInsert[],
    jobId: string,
    tokenSymbol: string,
  ): Promise<{ recordsInserted: number }> {
    logger.info("Writing DMA snapshots to database", {
      jobId,
      tokenSymbol,
      recordCount: snapshots.length,
    });

    const result = await this.writer.writeDmaSnapshots(snapshots);
    return { recordsInserted: result.recordsInserted };
  }

  private async writeRatioDmaSnapshots(
    snapshots: TokenPairRatioDmaSnapshotInsert[],
    jobId: string,
    pairContext: PairRatioContext,
  ): Promise<{ recordsInserted: number }> {
    logger.info("Writing pair ratio DMA snapshots to database", {
      jobId,
      baseTokenSymbol: pairContext.baseTokenSymbol,
      quoteTokenSymbol: pairContext.quoteTokenSymbol,
      recordCount: snapshots.length,
    });

    const result = await this.ratioWriter.writeRatioDmaSnapshots(snapshots);
    return { recordsInserted: result.recordsInserted };
  }

  private async computeAndWriteDma(
    prices: PriceRow[],
    correlationId: string,
    tokenSymbol: string,
  ): Promise<{ recordsInserted: number }> {
    const dmaSnapshots = computeDma(prices, DMA_WINDOW_SIZE);
    return this.writeDmaSnapshots(dmaSnapshots, correlationId, tokenSymbol);
  }

  private normalizeTokenContext(
    tokenSymbol: string,
    tokenId: string,
  ): TokenContext {
    return {
      tokenSymbol: tokenSymbol.trim().toUpperCase(),
      tokenId: tokenId.trim().toLowerCase(),
    };
  }

  private resolveCorrelationId(tokenSymbol: string, jobId?: string): string {
    return jobId ?? `dma-${tokenSymbol}-${Date.now()}`;
  }

  private resolvePairCorrelationId(
    pairContext: PairRatioContext,
    jobId?: string,
  ): string {
    return (
      jobId ??
      `dma-${pairContext.baseTokenSymbol}-${pairContext.quoteTokenSymbol}-${Date.now()}`
    );
  }

  private mapPriceRow(row: {
    token_symbol: string;
    token_id: string;
    snapshot_date: string;
    price_usd: string | number;
  }): PriceRow {
    return {
      token_symbol: row.token_symbol,
      token_id: row.token_id,
      snapshot_date: row.snapshot_date,
      price_usd: Number(row.price_usd),
    };
  }
}
