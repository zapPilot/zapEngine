import { ASSET_COLORS } from '@/constants/assets';
import type { LandingPageResponse } from '@/services';
import type { AllocationConstituent } from '@/types/portfolio';

/**
 * Constituent asset type for allocation breakdown
 */
export type { AllocationConstituent };

/**
 * Simplified portfolio allocation structure
 */
export interface PortfolioAllocation {
  crypto: number;
  stable: number;
  constituents: {
    crypto: AllocationConstituent[];
    stable: AllocationConstituent[];
  };
  simplifiedCrypto: AllocationConstituent[];
}

type CryptoAssetMeta = Omit<AllocationConstituent, 'value'>;

const BTC_META: CryptoAssetMeta = {
  asset: 'BTC',
  symbol: 'BTC',
  name: 'Bitcoin',
  color: ASSET_COLORS.BTC,
};
const ETH_META: CryptoAssetMeta = {
  asset: 'ETH',
  symbol: 'ETH',
  name: 'Ethereum',
  color: ASSET_COLORS.ETH,
};
const SPY_META: CryptoAssetMeta = {
  asset: 'SPY',
  symbol: 'SPY',
  name: 'S&P 500',
  color: ASSET_COLORS.SPY,
};
const ALT_META: CryptoAssetMeta = {
  asset: 'Others',
  symbol: 'ALT',
  name: 'Altcoins',
  color: ASSET_COLORS.ALT,
};

/** Builds a constituent from its static metadata plus a computed percentage. */
function constituent(
  meta: CryptoAssetMeta,
  value: number,
): AllocationConstituent {
  return { ...meta, value };
}

/**
 * Calculates current allocation from portfolio data
 */
export function calculateAllocation(
  landingData: LandingPageResponse,
): PortfolioAllocation {
  const allocation = landingData.portfolio_allocation;

  // Calculate total values
  const btcValue = allocation.btc.total_value;
  const ethValue = allocation.eth.total_value;
  const spyValue = allocation.spy?.total_value ?? 0;
  const othersValue = allocation.others.total_value;
  const stablecoinsValue = allocation.stablecoins.total_value;

  const totalCrypto = btcValue + ethValue + spyValue + othersValue;
  const totalAssets = totalCrypto + stablecoinsValue;

  // Protect against division by zero
  if (totalAssets === 0) {
    return {
      crypto: 0,
      stable: 0,
      constituents: {
        crypto: [],
        stable: [],
      },
      simplifiedCrypto: [],
    };
  }

  // Calculate percentages
  const cryptoPercent = (totalCrypto / totalAssets) * 100;
  const stablePercent = (stablecoinsValue / totalAssets) * 100;

  // Build constituents for detailed breakdown
  const safeCryptoDivisor = totalCrypto || 1;
  const cryptoConstituents: AllocationConstituent[] = [
    constituent(BTC_META, (btcValue / safeCryptoDivisor) * 100),
    constituent(ETH_META, (ethValue / safeCryptoDivisor) * 100),
    constituent(SPY_META, (spyValue / safeCryptoDivisor) * 100),
    constituent(ALT_META, (othersValue / safeCryptoDivisor) * 100),
  ].filter((c) => c.value > 0);
  const stableConstituents: AllocationConstituent[] = [];

  // Estimate USDC/USDT split (60/40 default - backend does not provide breakdown yet)
  if (stablecoinsValue > 0) {
    const usdcValue = stablecoinsValue * 0.6;
    const usdtValue = stablecoinsValue * 0.4;

    stableConstituents.push(
      {
        asset: 'USDC',
        symbol: 'USDC',
        name: 'USD Coin',
        value: (usdcValue / stablecoinsValue) * 100,
        color: ASSET_COLORS.USDC,
      },
      {
        asset: 'USDT',
        symbol: 'USDT',
        name: 'Tether',
        value: (usdtValue / stablecoinsValue) * 100,
        color: ASSET_COLORS.USDT,
      },
    );
  }

  // Create simplified crypto breakdown for composition bar
  // Using absolute portfolio percentages directly from API
  const simplifiedCrypto: AllocationConstituent[] = [
    constituent(BTC_META, allocation.btc.percentage_of_portfolio),
    constituent(ETH_META, allocation.eth.percentage_of_portfolio),
    constituent(SPY_META, allocation.spy?.percentage_of_portfolio ?? 0),
    constituent(ALT_META, allocation.others.percentage_of_portfolio),
  ].filter((c) => c.value > 0);

  return {
    crypto: cryptoPercent,
    stable: stablePercent,
    constituents: {
      crypto: cryptoConstituents,
      stable: stableConstituents,
    },
    simplifiedCrypto,
  };
}

/**
 * Calculates delta (drift) between current and target allocation
 */
export function calculateDelta(
  currentCrypto: number,
  targetCrypto: number,
): number {
  return Math.abs(targetCrypto - currentCrypto);
}
