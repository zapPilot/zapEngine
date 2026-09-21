import type {
  DesktopWalletAsset,
  InvestableBalanceRow,
} from '@/integration/moralisWallet';

/**
 * iOS is read-only. Home needs wallet assets and totals, not invest funding
 * rows, so transaction-oriented deposit metadata must not enter the bundle.
 */
export function buildInvestableBalanceRows(
  _assets: DesktopWalletAsset[],
): InvestableBalanceRow[] {
  return [];
}
