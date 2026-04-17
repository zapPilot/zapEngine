import type { TokenPriceData } from "../../modules/token-price/fetcher.js";
import { formatDateToYYYYMMDD } from "../../utils/dateUtils.js";
import { toErrorMessage } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

interface HistoricalPriceFetcher {
  formatDateForApi(date: Date): string;
  fetchHistoricalPrice(
    date: string,
    tokenId: string,
    tokenSymbol: string,
  ): Promise<TokenPriceData>;
}

interface ExistingDateWriter {
  getExistingDatesInRange(
    startDate: Date,
    endDate: Date,
    tokenSymbol: string,
    source: string,
  ): Promise<string[]>;
}

export interface BackfillDateRange {
  startDate: Date;
  endDate: Date;
}

export function getBackfillDateRange(daysBack: number): BackfillDateRange {
  const endDate = new Date();
  endDate.setUTCHours(0, 0, 0, 0);

  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - (daysBack - 1));

  return { startDate, endDate };
}

export function logGapDetectionSummary(
  existingDates: string[],
  missingDates: Date[],
  startDate: Date,
  endDate: Date,
  tokenSymbol: string,
  daysBack: number,
): void {
  logger.info("Gap detection completed", {
    tokenSymbol,
    existingCount: existingDates.length,
    existingDates: existingDates.slice(0, 5), // Show first 5 dates for debugging
    requestedDays: daysBack,
    startDate: formatDateToYYYYMMDD(startDate),
    endDate: formatDateToYYYYMMDD(endDate),
  });

  logger.info("Missing dates identified", {
    missingCount: missingDates.length,
    missingDates: missingDates.map(formatDateToYYYYMMDD).slice(0, 5), // Show first 5 missing dates
    tokenSymbol,
    efficiency: `${((existingDates.length / daysBack) * 100).toFixed(1)}% cached`,
  });
}

export async function fetchMissingDateSnapshots(
  missingDates: Date[],
  tokenId: string,
  tokenSymbol: string,
  fetcher: HistoricalPriceFetcher,
): Promise<TokenPriceData[]> {
  const snapshots: TokenPriceData[] = [];

  for (let index = 0; index < missingDates.length; index++) {
    const missingDate = missingDates[index];

    try {
      const dateStr = fetcher.formatDateForApi(missingDate);
      const priceData = await fetcher.fetchHistoricalPrice(
        dateStr,
        tokenId,
        tokenSymbol,
      );
      snapshots.push(priceData);

      logger.info(`Fetched missing price for ${dateStr}`, {
        tokenId,
        tokenSymbol,
        price: priceData.priceUsd,
        progress: `${index + 1}/${missingDates.length}`,
      });

      // Rate limiting is handled by CoinGeckoFetcher internally
    } catch (error) {
      logger.error("Failed to fetch missing date", {
        date: formatDateToYYYYMMDD(missingDate),
        tokenId,
        tokenSymbol,
        error: toErrorMessage(error),
      });
    }
  }

  return snapshots;
}

export async function getExistingDates(
  writer: ExistingDateWriter,
  startDate: Date,
  endDate: Date,
  tokenSymbol: string,
  daysBack: number,
): Promise<string[]> {
  try {
    const existingDates = await writer.getExistingDatesInRange(
      startDate,
      endDate,
      tokenSymbol,
      "coingecko",
    );

    logger.info("Gap detection completed", {
      tokenSymbol,
      existingCount: existingDates.length,
      requestedDays: daysBack,
    });

    return existingDates;
  } catch (error) {
    logger.warn("Gap detection failed, falling back to full fetch", {
      error: toErrorMessage(error),
      tokenSymbol,
    });
    return [];
  }
}
