import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger } from '../../../../src/utils/logger.js';

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

describe('stock-price/schema', () => {
  describe('YahooFinanceChartQuoteSchema', () => {
    it('should parse valid chart quote', async () => {
      const { YahooFinanceChartQuoteSchema } =
        await import('../../../../src/modules/stock-price/schema.js');

      const validQuote = {
        date: new Date('2024-12-15'),
        open: 4500.5,
        high: 4520.0,
        low: 4480.25,
        close: 4510.75,
        volume: 1000000,
        adjclose: 4510.75,
      };

      const result = YahooFinanceChartQuoteSchema.safeParse(validQuote);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.date).toEqual(new Date('2024-12-15'));
        expect(result.data.close).toBe(4510.75);
      }
    });

    it('should allow null values for OHLC data', async () => {
      const { YahooFinanceChartQuoteSchema } =
        await import('../../../../src/modules/stock-price/schema.js');

      const quoteWithNulls = {
        date: new Date('2024-12-15'),
        open: null,
        high: null,
        low: null,
        close: null,
        volume: null,
      };

      const result = YahooFinanceChartQuoteSchema.safeParse(quoteWithNulls);
      expect(result.success).toBe(true);
    });

    it('should reject invalid date type', async () => {
      const { YahooFinanceChartQuoteSchema } =
        await import('../../../../src/modules/stock-price/schema.js');

      const invalidQuote = {
        date: '2024-12-15',
        open: 4500.5,
        high: 4520.0,
        low: 4480.25,
        close: 4510.75,
        volume: 1000000,
      };

      const result = YahooFinanceChartQuoteSchema.safeParse(invalidQuote);
      expect(result.success).toBe(false);
    });
  });

  describe('DailyStockPrice interface', () => {
    it('should have correct shape', () => {
      const price: import('../../../../src/modules/stock-price/schema.js').DailyStockPrice =
        {
          date: '2024-12-15',
          priceUsd: 4510.75,
          symbol: 'SPY',
          source: 'yahoo-finance',
          timestamp: new Date('2024-12-15T16:00:00Z'),
        };

      expect(price.date).toBe('2024-12-15');
      expect(price.priceUsd).toBe(4510.75);
      expect(price.symbol).toBe('SPY');
      expect(price.source).toBe('yahoo-finance');
      expect(price.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('StockPriceData interface', () => {
    it('should have correct shape', () => {
      const price: import('../../../../src/modules/stock-price/schema.js').StockPriceData =
        {
          priceUsd: 4510.75,
          timestamp: new Date('2024-12-15'),
          source: 'yahoo-finance',
          symbol: 'SPY',
        };

      expect(price.priceUsd).toBe(4510.75);
      expect(price.timestamp).toBeInstanceOf(Date);
      expect(price.source).toBe('yahoo-finance');
      expect(price.symbol).toBe('SPY');
    });
  });
});
