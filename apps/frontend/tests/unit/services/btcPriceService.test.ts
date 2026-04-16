import { beforeEach, describe, expect, it, vi } from "vitest";

import { httpUtils } from "@/lib/http";
import { getBtcPriceHistory } from "@/services/btcPriceService";

// Mock httpUtils
vi.mock("@/lib/http", () => ({
  httpUtils: {
    analyticsEngine: {
      get: vi.fn(),
    },
  },
}));

describe("btcPriceService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getBtcPriceHistory", () => {
    it("should fetch BTC price history with default parameters", async () => {
      const mockResponse = {
        snapshots: [],
        count: 0,
        days_requested: 90,
        oldest_date: null,
        latest_date: null,
        cached: false,
      };

      vi.mocked(httpUtils.analyticsEngine.get).mockResolvedValue(mockResponse);

      const result = await getBtcPriceHistory();

      expect(result).toEqual(mockResponse);
      expect(httpUtils.analyticsEngine.get).toHaveBeenCalledWith(
        "/api/v2/market/btc/history?days=90&token=btc"
      );
    });

    it("should fetch price history for custom token and duration", async () => {
      const mockResponse = {
        snapshots: [],
        count: 10,
        days_requested: 30,
        oldest_date: "2024-01-01",
        latest_date: "2024-01-30",
        cached: true,
      };

      vi.mocked(httpUtils.analyticsEngine.get).mockResolvedValue(mockResponse);

      const result = await getBtcPriceHistory(30, "ETH");

      expect(result).toEqual(mockResponse);
      expect(httpUtils.analyticsEngine.get).toHaveBeenCalledWith(
        "/api/v2/market/btc/history?days=30&token=eth"
      );
    });

    it("should lower-case token symbol", async () => {
      vi.mocked(httpUtils.analyticsEngine.get).mockResolvedValue({});

      await getBtcPriceHistory(undefined, "SOL");

      expect(httpUtils.analyticsEngine.get).toHaveBeenCalledWith(
        "/api/v2/market/btc/history?days=90&token=sol"
      );
    });

    it("should propagate errors from http client", async () => {
      const mockError = new Error("Network error");
      vi.mocked(httpUtils.analyticsEngine.get).mockRejectedValue(mockError);

      await expect(getBtcPriceHistory()).rejects.toThrow("Network error");
    });
  });
});
