import { transformBatchWithLogging } from '../../core/transformers/baseTransformer.js';
import type { WalletBalanceSnapshotInsert } from '../../types/database.js';
import { toErrorMessage } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { maskWalletAddress } from '../../utils/mask.js';

export class WalletBalanceTransformer {
  private normalizeOptionalString(
    value: string | null | undefined,
  ): string | null | undefined {
    return value?.toLowerCase();
  }

  transform(
    rawData: WalletBalanceSnapshotInsert | null | undefined,
  ): WalletBalanceSnapshotInsert | null {
    try {
      // Validate input is an object (not string or other primitives)
      if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
        throw new Error('Invalid input: expected an object');
      }

      const transformed = Object.assign({}, rawData);

      // Normalize wallet address to lowercase for consistent DB storage
      transformed.user_wallet_address = this.normalizeOptionalString(
        rawData.user_wallet_address,
      )!;
      transformed.name = this.normalizeOptionalString(rawData.name);
      transformed.symbol = this.normalizeOptionalString(rawData.symbol);
      transformed.display_symbol = this.normalizeOptionalString(
        rawData.display_symbol,
      );
      transformed.optimized_symbol = this.normalizeOptionalString(
        rawData.optimized_symbol,
      );

      return transformed;
    } catch (error) {
      const rawRecord: Record<string, unknown> =
        rawData && typeof rawData === 'object' && !Array.isArray(rawData)
          ? (rawData as Record<string, unknown>)
          : {};
      const walletAddress =
        typeof rawRecord['user_wallet_address'] === 'string'
          ? rawRecord['user_wallet_address']
          : null;
      const tokenSymbol =
        typeof rawRecord['symbol'] === 'string' ? rawRecord['symbol'] : null;

      logger.error('Failed to transform wallet balance data:', {
        error: toErrorMessage(error),
        userId: rawRecord['user_id'] ?? 'unknown',
        walletAddress: walletAddress
          ? maskWalletAddress(walletAddress)
          : 'unknown',
        tokenSymbol: tokenSymbol ?? 'unknown',
      });
      return null;
    }
  }

  transformBatch(
    rawDataList: WalletBalanceSnapshotInsert[],
  ): WalletBalanceSnapshotInsert[] {
    return transformBatchWithLogging(
      rawDataList,
      (item) => this.transform(item),
      'Wallet balance',
    );
  }
}
