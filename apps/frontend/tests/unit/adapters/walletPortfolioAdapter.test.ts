/**
 * Unit tests for walletPortfolioAdapter.ts
 *
 * Tests data transformation logic with:
 * - Complete data transformation
 * - Partial data handling
 * - Edge cases (empty portfolios, null values)
 * - Regime allocation edge cases
 */

import { describe, expect, it } from 'vitest';

import { transformToWalletPortfolioData } from '@/adapters/walletPortfolioDataAdapter';
import type { LandingPageResponse } from '@/schemas/api/analyticsSchemas';
import type { MarketSentimentData } from '@/services/sentimentService';

describe('walletPortfolioAdapter', () => {
  describe('transformToWalletPortfolioData', () => {
    it('should transform complete landing page data correctly', () => {
      const landingData: LandingPageResponse = {
        total_assets_usd: 50000,
        total_debt_usd: 0,
        total_net_usd: 50000,
        net_portfolio_value: 50000,
        weighted_apr: 8.5,
        estimated_monthly_income: 350,
        portfolio_roi: {
          recommended_roi: 12.4,
          recommended_period: '365d',
          recommended_yearly_roi: 12.4,
          estimated_yearly_pnl_usd: 6200,
          windows: {
            '7d': { value: 2.1, data_points: 7 },
            '30d': { value: 8.3, data_points: 30 },
            '365d': { value: 12.4, data_points: 365 },
          },
        },
        portfolio_allocation: {
          btc: {
            total_value: 20000,
            percentage_of_portfolio: 40,
            wallet_tokens_value: 15000,
            other_sources_value: 5000,
          },
          eth: {
            total_value: 15000,
            percentage_of_portfolio: 30,
            wallet_tokens_value: 10000,
            other_sources_value: 5000,
          },
          others: {
            total_value: 5000,
            percentage_of_portfolio: 10,
            wallet_tokens_value: 3000,
            other_sources_value: 2000,
          },
          stablecoins: {
            total_value: 10000,
            percentage_of_portfolio: 20,
            wallet_tokens_value: 8000,
            other_sources_value: 2000,
          },
        },
        wallet_token_summary: {
          total_value_usd: 36000,
          token_count: 15,
          apr_30d: null,
        },
        category_summary_debt: {
          btc: 0,
          eth: 0,
          stablecoins: 0,
          others: 0,
        },
        pool_details: [
          {
            wallet: '0x123',
            protocol_id: 'aave-v3',
            protocol: 'aave-v3',
            protocol_name: 'Aave V3',
            chain: 'ethereum',
            asset_usd_value: 10000,
            pool_symbols: ['USDC'],
            contribution_to_portfolio: 20,
            snapshot_id: 'snap1',
          },
          {
            wallet: '0x123',
            protocol_id: 'curve',
            protocol: 'curve',
            protocol_name: 'Curve',
            chain: 'polygon',
            asset_usd_value: 5000,
            pool_symbols: ['DAI', 'USDC'],
            contribution_to_portfolio: 10,
            snapshot_id: 'snap2',
          },
        ],
        positions: 2,
        protocols: 2,
        chains: 2,
        wallet_count: 1,
        last_updated: '2025-01-01T00:00:00Z',
        apr_coverage: {
          matched_pools: 2,
          total_pools: 2,
          coverage_percentage: 100,
          matched_asset_value_usd: 15000,
        },
      };

      const sentimentData: MarketSentimentData = {
        value: 65,
        status: 'Greed',
        timestamp: '2025-01-01T00:00:00Z',
        quote: {
          quote: 'Markets are showing optimism',
          author: 'Market Analysis',
          sentiment: 'Greed',
        },
      };

      const result = transformToWalletPortfolioData(landingData, sentimentData);

      // Portfolio metrics
      expect(result.balance).toBe(50000);
      expect(result.roi).toBe(12.4);
      expect(result.roiChange7d).toBe(2.1);
      expect(result.roiChange30d).toBe(8.3);

      // Regime & sentiment
      expect(result.sentimentValue).toBe(65);
      expect(result.sentimentStatus).toBe('Greed');
      expect(result.currentRegime).toBe('g'); // Greed regime

      // Allocations
      expect(result.currentAllocation.crypto).toBe(80); // (20k + 15k + 5k) / 50k * 100
      expect(result.currentAllocation.stable).toBe(20); // 10k / 50k * 100
      expect(result.targetAllocation.crypto).toBe(45); // Greed regime target (Take Profit: 45/55)
      expect(result.targetAllocation.stable).toBe(55);
      expect(result.delta).toBe(35); // |80 - 45|

      // Portfolio details
      expect(result.positions).toBe(2);
      expect(result.protocols).toBe(2);
      expect(result.chains).toBe(2);

      // State
      expect(result.isLoading).toBe(false);
      expect(result.hasError).toBe(false);
    });

    it('should handle missing sentiment data with defaults', () => {
      const landingData: LandingPageResponse = {
        total_assets_usd: 10000,
        total_debt_usd: 0,
        total_net_usd: 10000,
        net_portfolio_value: 10000,
        weighted_apr: 5,
        estimated_monthly_income: 42,
        portfolio_roi: {
          recommended_roi: 5,
          recommended_period: '365d',
          recommended_yearly_roi: 5,
          estimated_yearly_pnl_usd: 500,
        },
        portfolio_allocation: {
          btc: {
            total_value: 5000,
            percentage_of_portfolio: 50,
            wallet_tokens_value: 5000,
            other_sources_value: 0,
          },
          eth: {
            total_value: 0,
            percentage_of_portfolio: 0,
            wallet_tokens_value: 0,
            other_sources_value: 0,
          },
          others: {
            total_value: 0,
            percentage_of_portfolio: 0,
            wallet_tokens_value: 0,
            other_sources_value: 0,
          },
          stablecoins: {
            total_value: 5000,
            percentage_of_portfolio: 50,
            wallet_tokens_value: 5000,
            other_sources_value: 0,
          },
        },
        wallet_token_summary: {
          total_value_usd: 10000,
          token_count: 2,
          apr_30d: null,
        },
        category_summary_debt: {
          btc: 0,
          eth: 0,
          stablecoins: 0,
          others: 0,
        },
        pool_details: [],
        positions: 0,
        protocols: 0,
        chains: 0,
        wallet_count: 0,
        last_updated: null,
        apr_coverage: {
          matched_pools: 0,
          total_pools: 0,
          coverage_percentage: 0,
          matched_asset_value_usd: 0,
        },
      };

      const result = transformToWalletPortfolioData(landingData, null);

      // Should default to neutral regime
      expect(result.sentimentValue).toBe(50);
      expect(result.sentimentStatus).toBe('Neutral');
      expect(result.currentRegime).toBe('n');
      expect(result.targetAllocation.crypto).toBe(50); // Neutral regime (Balanced: 50/50)
      expect(result.targetAllocation.stable).toBe(50);
    });

    it('should handle empty portfolio correctly', () => {
      const landingData: LandingPageResponse = {
        total_assets_usd: 0,
        total_debt_usd: 0,
        total_net_usd: 0,
        net_portfolio_value: 0,
        weighted_apr: 0,
        estimated_monthly_income: 0,
        portfolio_roi: {
          recommended_roi: 0,
          recommended_period: '365d',
          recommended_yearly_roi: 0,
          estimated_yearly_pnl_usd: 0,
        },
        portfolio_allocation: {
          btc: {
            total_value: 0,
            percentage_of_portfolio: 0,
            wallet_tokens_value: 0,
            other_sources_value: 0,
          },
          eth: {
            total_value: 0,
            percentage_of_portfolio: 0,
            wallet_tokens_value: 0,
            other_sources_value: 0,
          },
          others: {
            total_value: 0,
            percentage_of_portfolio: 0,
            wallet_tokens_value: 0,
            other_sources_value: 0,
          },
          stablecoins: {
            total_value: 0,
            percentage_of_portfolio: 0,
            wallet_tokens_value: 0,
            other_sources_value: 0,
          },
        },
        wallet_token_summary: {
          total_value_usd: 0,
          token_count: 0,
          apr_30d: null,
        },
        category_summary_debt: {
          btc: 0,
          eth: 0,
          stablecoins: 0,
          others: 0,
        },
        pool_details: [],
        positions: 0,
        protocols: 0,
        chains: 0,
        wallet_count: 0,
        last_updated: null,
        apr_coverage: {
          matched_pools: 0,
          total_pools: 0,
          coverage_percentage: 0,
          matched_asset_value_usd: 0,
        },
      };

      const result = transformToWalletPortfolioData(landingData, null);

      // Should handle zero division gracefully
      expect(result.balance).toBe(0);
      expect(result.currentAllocation.crypto).toBe(0);
      expect(result.currentAllocation.stable).toBe(0);
      expect(result.currentAllocation.constituents.crypto).toEqual([]);
      expect(result.currentAllocation.constituents.stable).toEqual([]);
      expect(result.currentAllocation.simplifiedCrypto).toEqual([]);
    });

    it('should calculate allocation percentages correctly', () => {
      const landingData: LandingPageResponse = {
        total_assets_usd: 100000,
        total_debt_usd: 0,
        total_net_usd: 100000,
        net_portfolio_value: 100000,
        weighted_apr: 10,
        estimated_monthly_income: 833,
        portfolio_roi: {
          recommended_roi: 10,
          recommended_period: '365d',
          recommended_yearly_roi: 10,
          estimated_yearly_pnl_usd: 10000,
        },
        portfolio_allocation: {
          btc: {
            total_value: 30000,
            percentage_of_portfolio: 30,
            wallet_tokens_value: 30000,
            other_sources_value: 0,
          },
          eth: {
            total_value: 20000,
            percentage_of_portfolio: 20,
            wallet_tokens_value: 20000,
            other_sources_value: 0,
          },
          others: {
            total_value: 10000,
            percentage_of_portfolio: 10,
            wallet_tokens_value: 10000,
            other_sources_value: 0,
          },
          stablecoins: {
            total_value: 40000,
            percentage_of_portfolio: 40,
            wallet_tokens_value: 40000,
            other_sources_value: 0,
          },
        },
        wallet_token_summary: {
          total_value_usd: 100000,
          token_count: 4,
          apr_30d: null,
        },
        category_summary_debt: {
          btc: 0,
          eth: 0,
          stablecoins: 0,
          others: 0,
        },
        pool_details: [],
        positions: 0,
        protocols: 0,
        chains: 0,
        wallet_count: 0,
        last_updated: null,
        apr_coverage: {
          matched_pools: 0,
          total_pools: 0,
          coverage_percentage: 0,
          matched_asset_value_usd: 0,
        },
      };

      const result = transformToWalletPortfolioData(landingData, null);

      // Crypto = 30k + 20k + 10k = 60k / 100k = 60%
      expect(result.currentAllocation.crypto).toBe(60);
      // Stable = 40k / 100k = 40%
      expect(result.currentAllocation.stable).toBe(40);

      // Check constituent percentages (relative to category)
      const btcConstituent = result.currentAllocation.constituents.crypto.find(
        (c) => c.symbol === 'BTC',
      );
      expect(btcConstituent?.value).toBe(50); // 30k / 60k * 100

      const ethConstituent = result.currentAllocation.constituents.crypto.find(
        (c) => c.symbol === 'ETH',
      );
      expect(ethConstituent?.value).toBeCloseTo(33.33, 1); // 20k / 60k * 100
    });

    it('should handle different regime ranges correctly', () => {
      const baseLandingData: LandingPageResponse = {
        total_assets_usd: 10000,
        total_debt_usd: 0,
        total_net_usd: 10000,
        net_portfolio_value: 10000,
        weighted_apr: 5,
        estimated_monthly_income: 42,
        portfolio_roi: {
          recommended_roi: 5,
          recommended_period: '365d',
          recommended_yearly_roi: 5,
          estimated_yearly_pnl_usd: 500,
        },
        portfolio_allocation: {
          btc: {
            total_value: 5000,
            percentage_of_portfolio: 50,
            wallet_tokens_value: 5000,
            other_sources_value: 0,
          },
          eth: {
            total_value: 0,
            percentage_of_portfolio: 0,
            wallet_tokens_value: 0,
            other_sources_value: 0,
          },
          others: {
            total_value: 0,
            percentage_of_portfolio: 0,
            wallet_tokens_value: 0,
            other_sources_value: 0,
          },
          stablecoins: {
            total_value: 5000,
            percentage_of_portfolio: 50,
            wallet_tokens_value: 5000,
            other_sources_value: 0,
          },
        },
        wallet_token_summary: {
          total_value_usd: 10000,
          token_count: 2,
          apr_30d: null,
        },
        category_summary_debt: {
          btc: 0,
          eth: 0,
          stablecoins: 0,
          others: 0,
        },
        pool_details: [],
        positions: 0,
        protocols: 0,
        chains: 0,
        wallet_count: 0,
        last_updated: null,
        apr_coverage: {
          matched_pools: 0,
          total_pools: 0,
          coverage_percentage: 0,
          matched_asset_value_usd: 0,
        },
      };

      // Extreme Fear (ef) - 70/30 crypto/stable (Buying the dip strategy)
      const extremeFearResult = transformToWalletPortfolioData(
        baseLandingData,
        {
          value: 20,
          status: 'Extreme Fear',
          timestamp: '2025-01-01T00:00:00Z',
          quote: {
            quote: 'Panic selling',
            author: 'Market',
            sentiment: 'Extreme Fear',
          },
        },
      );
      expect(extremeFearResult.currentRegime).toBe('ef');
      expect(extremeFearResult.targetAllocation.crypto).toBe(70);
      expect(extremeFearResult.targetAllocation.stable).toBe(30);

      // Extreme Greed (eg) - 30/70 crypto/stable (Profit taking)
      const extremeGreedResult = transformToWalletPortfolioData(
        baseLandingData,
        {
          value: 85,
          status: 'Extreme Greed',
          timestamp: '2025-01-01T00:00:00Z',
          quote: {
            quote: 'FOMO buying',
            author: 'Market',
            sentiment: 'Extreme Greed',
          },
        },
      );
      expect(extremeGreedResult.currentRegime).toBe('eg');
      expect(extremeGreedResult.targetAllocation.crypto).toBe(30);
      expect(extremeGreedResult.targetAllocation.stable).toBe(70);
    });

    it('should decouple regime from value if status contradicts it', () => {
      const baseLandingData: LandingPageResponse = {
        total_assets_usd: 10000,
        total_debt_usd: 0,
        total_net_usd: 10000,
        net_portfolio_value: 10000,
        weighted_apr: 5,
        estimated_monthly_income: 42,
        portfolio_roi: {
          recommended_roi: 5,
          recommended_period: '365d',
          recommended_yearly_roi: 5,
          estimated_yearly_pnl_usd: 500,
        },
        portfolio_allocation: {
          btc: {
            total_value: 0,
            percentage_of_portfolio: 0,
            wallet_tokens_value: 0,
            other_sources_value: 0,
          },
          eth: {
            total_value: 0,
            percentage_of_portfolio: 0,
            wallet_tokens_value: 0,
            other_sources_value: 0,
          },
          others: {
            total_value: 0,
            percentage_of_portfolio: 0,
            wallet_tokens_value: 0,
            other_sources_value: 0,
          },
          stablecoins: {
            total_value: 10000,
            percentage_of_portfolio: 100,
            wallet_tokens_value: 10000,
            other_sources_value: 0,
          },
        },
        wallet_token_summary: {
          total_value_usd: 10000,
          token_count: 1,
          apr_30d: null,
        },
        category_summary_debt: { btc: 0, eth: 0, stablecoins: 0, others: 0 },
        pool_details: [],
        positions: 0,
        protocols: 0,
        chains: 0,
        wallet_count: 0,
        last_updated: null,
        apr_coverage: {
          matched_pools: 0,
          total_pools: 0,
          coverage_percentage: 0,
          matched_asset_value_usd: 0,
        },
      };

      // Value: 90 (Extreme Greed range)
      // Status: "Extreme Fear" (explicit override from backend)
      const conflictingData: MarketSentimentData = {
        value: 90,
        status: 'Extreme Fear',
        timestamp: '2025-01-01T00:00:00Z',
        quote: {
          quote: 'Trust the status, not the value',
          author: 'Backend',
          sentiment: 'Extreme Fear',
        },
      };

      const result = transformToWalletPortfolioData(
        baseLandingData,
        conflictingData,
      );

      // Should obey STATUS ("Extreme Fear" -> "ef"), ignoring VALUE (90 -> "eg")
      expect(result.currentRegime).toBe('ef');
      expect(result.sentimentStatus).toBe('Extreme Fear');
      // Verify targets match Extreme Fear (70/30) not Extreme Greed (30/70)
      expect(result.targetAllocation.crypto).toBe(70);
      expect(result.targetAllocation.stable).toBe(30);
    });
  });
});
