import type { WalletPortfolioDataWithDirection } from '@zapengine/app-core/adapters/walletPortfolioDataAdapter';
import { ASSET_COLORS } from '@zapengine/app-core/constants/assets';
import { getRegimeAllocation, type Regime } from '@zapengine/app-core/regime';
import type { AllocationConstituent } from '@zapengine/app-core/types/portfolio';

/**
 * Build target crypto assets from regime breakdown for empty state
 * Maps all invest spot exposure to a neutral Crypto segment for the empty-state
 * target visual because regime data has no per-asset breakdown.
 */
export function buildTargetCryptoAssets(
  regime: Regime,
): AllocationConstituent[] {
  const breakdown = getRegimeAllocation(regime);
  const totalCrypto = breakdown.spot;

  if (totalCrypto === 0) {
    return [];
  }

  return [
    {
      asset: 'Crypto',
      symbol: 'CRYPTO',
      name: 'Crypto',
      value: (breakdown.spot / totalCrypto) * 100,
      color: ASSET_COLORS.ALT,
    },
  ];
}

/**
 * Get real crypto assets from portfolio data
 */
export function buildRealCryptoAssets(
  data: WalletPortfolioDataWithDirection,
): AllocationConstituent[] {
  return data.currentAllocation.simplifiedCrypto;
}
