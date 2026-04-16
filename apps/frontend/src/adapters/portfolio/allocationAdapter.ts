import { ASSET_COLORS } from "@/constants/assets";
import type { LandingPageResponse } from "@/services";
import type { AllocationConstituent } from "@/types/portfolio";

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

const CRYPTO_ASSET_META: Omit<AllocationConstituent, "value">[] = [
  { asset: "BTC", symbol: "BTC", name: "Bitcoin", color: ASSET_COLORS.BTC },
  { asset: "ETH", symbol: "ETH", name: "Ethereum", color: ASSET_COLORS.ETH },
  { asset: "Others", symbol: "ALT", name: "Altcoins", color: ASSET_COLORS.ALT },
];

/**
 * Calculates current allocation from portfolio data
 */
export function calculateAllocation(
  landingData: LandingPageResponse
): PortfolioAllocation {
  const allocation = landingData.portfolio_allocation;

  // Calculate total values
  const btcValue = allocation.btc.total_value;
  const ethValue = allocation.eth.total_value;
  const othersValue = allocation.others.total_value;
  const stablecoinsValue = allocation.stablecoins.total_value;

  const totalCrypto = btcValue + ethValue + othersValue;
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
  const [btcMeta, ethMeta, altMeta] = CRYPTO_ASSET_META as [
    Omit<AllocationConstituent, "value">,
    Omit<AllocationConstituent, "value">,
    Omit<AllocationConstituent, "value">,
  ];
  const cryptoConstituents: AllocationConstituent[] = [
    { ...btcMeta, value: (btcValue / safeCryptoDivisor) * 100 },
    { ...ethMeta, value: (ethValue / safeCryptoDivisor) * 100 },
    { ...altMeta, value: (othersValue / safeCryptoDivisor) * 100 },
  ].filter(c => c.value > 0);
  const stableConstituents: AllocationConstituent[] = [];

  // Estimate USDC/USDT split (60/40 default - backend does not provide breakdown yet)
  if (stablecoinsValue > 0) {
    const usdcValue = stablecoinsValue * 0.6;
    const usdtValue = stablecoinsValue * 0.4;

    stableConstituents.push(
      {
        asset: "USDC",
        symbol: "USDC",
        name: "USD Coin",
        value: (usdcValue / stablecoinsValue) * 100,
        color: ASSET_COLORS.USDC,
      },
      {
        asset: "USDT",
        symbol: "USDT",
        name: "Tether",
        value: (usdtValue / stablecoinsValue) * 100,
        color: ASSET_COLORS.USDT,
      }
    );
  }

  // Create simplified crypto breakdown for composition bar
  // Using absolute portfolio percentages directly from API
  const simplifiedCrypto: AllocationConstituent[] = [
    { ...btcMeta, value: allocation.btc.percentage_of_portfolio },
    { ...ethMeta, value: allocation.eth.percentage_of_portfolio },
    { ...altMeta, value: allocation.others.percentage_of_portfolio },
  ].filter(c => c.value > 0);

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
  targetCrypto: number
): number {
  return Math.abs(targetCrypto - currentCrypto);
}
