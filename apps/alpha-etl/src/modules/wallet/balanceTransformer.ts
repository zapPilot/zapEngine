import { logger } from '../../utils/logger.js';
import { toErrorMessage } from '../../utils/errors.js';
import { maskWalletAddress } from '../../utils/mask.js';
import { transformBatchWithLogging } from '../../core/transformers/baseTransformer.js';
import type { WalletBalanceSnapshotInsert } from '../../types/database.js';

export class WalletBalanceTransformer {
  private normalizeOptionalString(value: string | null | undefined): string | null | undefined {
    return value?.toLowerCase();
  }

  transform(rawData: WalletBalanceSnapshotInsert): WalletBalanceSnapshotInsert | null {
    try {
      // Validate input is an object (not string or other primitives)
      if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
        throw new Error('Invalid input: expected an object');
      }

      // Normalize wallet address to lowercase for consistent DB storage
      return {
        ...rawData,
        user_wallet_address: this.normalizeOptionalString(rawData.user_wallet_address) as string,
        name: this.normalizeOptionalString(rawData.name),
        symbol: this.normalizeOptionalString(rawData.symbol),
        display_symbol: this.normalizeOptionalString(rawData.display_symbol),
        optimized_symbol: this.normalizeOptionalString(rawData.optimized_symbol),
      };
    } catch (error) {
      logger.error('Failed to transform wallet balance data:', {
        error: toErrorMessage(error),
        userId: rawData?.user_id || 'unknown',
        walletAddress: rawData?.user_wallet_address ? maskWalletAddress(rawData.user_wallet_address) : 'unknown',
        tokenSymbol: rawData?.symbol || 'unknown'
      });
      return null;
    }
  }

  transformBatch(rawDataList: WalletBalanceSnapshotInsert[]): WalletBalanceSnapshotInsert[] {
    return transformBatchWithLogging(
      rawDataList,
      (item) => this.transform(item),
      'Wallet balance'
    );
  }
}
