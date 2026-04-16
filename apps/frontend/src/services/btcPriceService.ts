import { httpUtils } from "@/lib/http";

export interface BtcPriceSnapshot {
  date: string;
  price_usd: number;
  market_cap_usd?: number;
  volume_24h_usd?: number;
  source: string;
  /** @deprecated use token_id or specific symbol fields */
  token_symbol?: string;
  token_id?: string;
}

export interface BtcPriceHistoryResponse {
  snapshots: BtcPriceSnapshot[];
  count: number;
  days_requested: number;
  oldest_date: string | null;
  latest_date: string | null;
  cached: boolean;
}

/**
 * Fetch token historical price data from analytics-engine
 *
 * Supports multiple tokens (BTC, ETH, SOL, etc.) with backward compatibility.
 *
 * @param days - Number of days of history (1-365, default: 90)
 * @param token - Token symbol (default: 'btc', case insensitive)
 * @returns Promise<BtcPriceHistoryResponse>
 */
export async function getBtcPriceHistory(
  days = 90,
  token = "btc"
): Promise<BtcPriceHistoryResponse> {
  return httpUtils.analyticsEngine.get<BtcPriceHistoryResponse>(
    `/api/v2/market/btc/history?days=${days}&token=${token.toLowerCase()}`
  );
}
