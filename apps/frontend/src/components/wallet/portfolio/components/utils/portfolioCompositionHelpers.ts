import type { WalletPortfolioDataWithDirection } from "@/adapters/walletPortfolioDataAdapter";
import {
  getRegimeAllocation,
  type Regime,
} from "@/components/wallet/regime/regimeData";
import { ASSET_COLORS } from "@/constants/assets";
import type { AllocationConstituent } from "@/types/portfolio";

/**
 * Build target crypto assets from regime breakdown for empty state
 * Maps all invest spot exposure to BTC for the empty-state target visual.
 */
export function buildTargetCryptoAssets(
  regime: Regime
): AllocationConstituent[] {
  const breakdown = getRegimeAllocation(regime);
  const totalCrypto = breakdown.spot;

  if (totalCrypto === 0) {
    return [];
  }

  const assets: AllocationConstituent[] = [];

  assets.push({
    asset: "BTC",
    symbol: "BTC",
    name: "Bitcoin (Spot)",
    value: (breakdown.spot / totalCrypto) * 100,
    color: ASSET_COLORS.BTC,
  });

  return assets;
}

/**
 * Get real crypto assets from portfolio data
 */
export function buildRealCryptoAssets(
  data: WalletPortfolioDataWithDirection
): AllocationConstituent[] {
  return data.currentAllocation.simplifiedCrypto;
}
