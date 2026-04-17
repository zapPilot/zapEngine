import { logger } from "../../utils/logger.js";
import { maskWalletAddress } from "../../utils/mask.js";
import type {
  DeBankFetcher,
  DeBankTokenBalance,
  DeBankComplexProtocolList,
} from "../../modules/wallet/fetcher.js";
import type { WalletBalanceSnapshotInsert } from "../../types/database.js";

interface FetchWalletDataOptions {
  warningMessage: string;
  context?: Record<string, unknown>;
}

export interface DeBankWalletData {
  tokens: DeBankTokenBalance[];
  protocols: DeBankComplexProtocolList;
}

export async function fetchWalletDataFromDeBank(
  debankFetcher: DeBankFetcher,
  walletAddress: string,
  options: FetchWalletDataOptions,
): Promise<DeBankWalletData | null> {
  const [tokenResponse, protocolResponse] = await Promise.all([
    debankFetcher.fetchWalletTokenList(walletAddress),
    debankFetcher.fetchComplexProtocolList(walletAddress),
  ]);

  const tokensValid = Array.isArray(tokenResponse);
  const protocolsValid = Array.isArray(protocolResponse);

  if (tokensValid && protocolsValid) {
    return {
      tokens: tokenResponse,
      protocols: protocolResponse,
    };
  }

  logger.warn(options.warningMessage, {
    ...options.context,
    wallet: maskWalletAddress(walletAddress),
    tokensValid,
    protocolsValid,
  });
  return null;
}

export function mapTokenBalancesToSnapshots(
  tokens: DeBankTokenBalance[],
  walletAddress: string,
): WalletBalanceSnapshotInsert[] {
  return tokens.map((tokenObj) => ({
    user_wallet_address: walletAddress,
    token_address: tokenObj.id,
    ...tokenObj,
  }));
}
