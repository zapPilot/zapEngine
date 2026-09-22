import { BASE_DEPOSIT_TOKENS } from '@/integration/depositTokens';
import type {
  DesktopWalletAsset,
  InvestableBalanceRow,
} from '@/integration/walletAssetModel';

function tokenName(asset: DesktopWalletAsset): string {
  return asset.name || asset.symbol;
}

export function buildInvestableBalanceRows(
  assets: DesktopWalletAsset[],
): InvestableBalanceRow[] {
  return assets.map((asset) => {
    const depositToken = asset.chains.includes('base')
      ? (BASE_DEPOSIT_TOKENS.find((token) => token.symbol === asset.symbol) ??
        null)
      : null;
    return {
      token: {
        symbol: asset.symbol,
        name: tokenName(asset),
      },
      chains: asset.chains,
      depositToken,
      balance: asset.rawAmount > 0 ? String(asset.rawAmount) : null,
      amountLabel: asset.amountLabel,
      usdValue: asset.usdValue,
      usdPrice: asset.usdPrice,
      isDepositSupported: depositToken !== null,
      isLoading: false,
      isError: false,
    };
  });
}
