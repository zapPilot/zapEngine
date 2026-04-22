import { describe, expect, it } from 'vitest';

import type { WalletPortfolioDataWithDirection } from '@/adapters/walletPortfolioDataAdapter';
import {
  buildRealCryptoAssets,
  buildTargetCryptoAssets,
} from '@/components/wallet/portfolio/components/utils/portfolioCompositionHelpers';
import { regimes } from '@/components/wallet/regime/regimeData';

describe('buildTargetCryptoAssets', () => {
  it('returns a BTC entry for a regime with spot exposure > 0', () => {
    // Extreme Fear regime has spot > 0 (it accumulates)
    const regime = regimes.find((r) => r.id === 'ef');
    expect(regime).toBeDefined();

    const result = buildTargetCryptoAssets(regime!);

    expect(result).toHaveLength(1);
    expect(result[0]?.asset).toBe('BTC');
    expect(result[0]?.symbol).toBe('BTC');
    expect(result[0]?.value).toBeGreaterThan(0);
    expect(result[0]?.value).toBeLessThanOrEqual(100);
  });

  it('returns an empty array when spot allocation is 0', () => {
    // Build a mock regime where getRegimeAllocation returns spot=0
    // We can use a regime that has spot > 0 and override it with a test object
    const mockRegime = {
      id: 'eg' as const,
      label: 'Extreme Greed',
      fillColor: '#e53e3e',
      filterColor: '#e53e3e',
      strategies: {
        default: {
          philosophy: 'test',
          author: 'test',
          useCase: {
            scenario: 'test',
            userIntent: 'test',
            zapAction: 'test',
            allocationBefore: { spot: 100, stable: 0 },
            allocationAfter: { spot: 0, stable: 100 },
          },
        },
      },
    };

    const result = buildTargetCryptoAssets(
      mockRegime as Parameters<typeof buildTargetCryptoAssets>[0],
    );
    expect(result).toEqual([]);
  });

  it('returns correct BTC value as 100% of spot when regime has full spot exposure', () => {
    const regime = regimes.find((r) => r.id === 'ef');
    expect(regime).toBeDefined();

    const result = buildTargetCryptoAssets(regime!);

    // When totalCrypto > 0, value = (spot / totalCrypto) * 100 = 100%
    expect(result[0]?.value).toBe(100);
  });
});

describe('buildRealCryptoAssets', () => {
  it('returns the simplifiedCrypto array from currentAllocation', () => {
    const mockData = {
      currentAllocation: {
        simplifiedCrypto: [
          {
            asset: 'ETH',
            symbol: 'ETH',
            name: 'Ethereum',
            value: 60,
            color: '#627EEA',
          },
          {
            asset: 'BTC',
            symbol: 'BTC',
            name: 'Bitcoin',
            value: 40,
            color: '#F7931A',
          },
        ],
      },
    } as unknown as WalletPortfolioDataWithDirection;

    const result = buildRealCryptoAssets(mockData);

    expect(result).toHaveLength(2);
    expect(result[0]?.asset).toBe('ETH');
    expect(result[1]?.asset).toBe('BTC');
  });

  it('returns an empty array when simplifiedCrypto is empty', () => {
    const mockData = {
      currentAllocation: {
        simplifiedCrypto: [],
      },
    } as unknown as WalletPortfolioDataWithDirection;

    const result = buildRealCryptoAssets(mockData);
    expect(result).toEqual([]);
  });
});
