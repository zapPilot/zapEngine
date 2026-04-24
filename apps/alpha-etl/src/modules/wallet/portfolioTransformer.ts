import type {
  DeBankProtocol,
  DeBankProtocolItem,
} from '../../modules/wallet/fetcher.js';
import type { PortfolioItemSnapshotInsert } from '../../types/database.js';
import {
  resolveSnapshotTime,
  type SnapshotTimeContext,
} from '../../utils/dateUtils.js';
import { toErrorMessage } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { maskWalletAddress } from '../../utils/mask.js';

export interface TransformPortfolioParams {
  protocol: DeBankProtocol;
  item: DeBankProtocolItem;
  walletAddress: string;
  timestamp?: string;
}

export class DeBankPortfolioTransformer {
  private getPortfolioItems(protocol: DeBankProtocol): DeBankProtocolItem[] {
    const candidate = (protocol as { portfolio_item_list?: unknown })
      .portfolio_item_list;
    return Array.isArray(candidate) ? (candidate as DeBankProtocolItem[]) : [];
  }

  private isFiniteStats(item: DeBankProtocolItem): boolean {
    return (
      Number.isFinite(item.stats.asset_usd_value) &&
      Number.isFinite(item.stats.debt_usd_value) &&
      Number.isFinite(item.stats.net_usd_value)
    );
  }

  private buildSnapshot(
    protocol: DeBankProtocol,
    item: DeBankProtocolItem,
    walletAddress: string,
    snapshot: SnapshotTimeContext,
  ): PortfolioItemSnapshotInsert {
    const poolId = item.pool['id'];
    if (typeof poolId !== 'string') {
      throw new Error('DeBank portfolio item missing pool id');
    }

    return {
      wallet: walletAddress.toLowerCase(),
      chain: protocol.chain,
      name: protocol.name,
      name_item: item.name,
      id_raw: poolId,
      asset_usd_value: item.stats.asset_usd_value,
      debt_usd_value: item.stats.debt_usd_value,
      net_usd_value: item.stats.net_usd_value,
      snapshot_at: snapshot.snapshotAt,
      update_at: item.update_at || snapshot.epochSeconds,
      has_supported_portfolio: protocol.has_supported_portfolio,
      site_url: protocol.logo_url ?? '',
      detail: item.detail,
      asset_dict: item.asset_dict,
      asset_token_list: item.asset_token_list,
      detail_types: item.detail_types,
      pool: item.pool,
      proxy_detail: item.proxy_detail ?? {},
    };
  }

  /**
   * Transform a single DeBank portfolio item to PortfolioItemSnapshotInsert format
   */
  transformItem({
    protocol,
    item,
    walletAddress,
    timestamp,
  }: TransformPortfolioParams): PortfolioItemSnapshotInsert | null {
    try {
      if (!this.isFiniteStats(item)) {
        logger.warn('DeBank portfolio item contains invalid numeric values', {
          wallet: maskWalletAddress(walletAddress),
          protocol: protocol.name,
          itemName: item.name,
        });
        return null;
      }

      const snapshot = resolveSnapshotTime(timestamp);
      return this.buildSnapshot(protocol, item, walletAddress, snapshot);
    } catch (error) {
      logger.error('Failed to transform DeBank portfolio item', {
        error: toErrorMessage(error),
        wallet: maskWalletAddress(walletAddress),
        protocol: protocol.name,
      });
      return null;
    }
  }

  /**
   * Transform a batch of DeBank protocols to PortfolioItemSnapshotInsert format
   * Processes all portfolio items across all protocols for a given wallet
   */
  transformBatch(
    protocols: DeBankProtocol[],
    walletAddress: string,
  ): PortfolioItemSnapshotInsert[] {
    const totalItemsBeforeFilter = protocols.reduce(
      (sum, protocol) => sum + this.getPortfolioItems(protocol).length,
      0,
    );

    logger.debug('Portfolio transformation starting', {
      wallet: maskWalletAddress(walletAddress),
      protocolsCount: protocols.length,
      totalItemsToProcess: totalItemsBeforeFilter,
    });

    const results: PortfolioItemSnapshotInsert[] = [];

    // Generate ONE timestamp for the entire batch to ensure consistent snapshot time
    // This allows Materialized Views to correctly group all items for this snapshot
    const batchTimestamp = new Date().toISOString();

    for (const protocol of protocols) {
      const items = this.getPortfolioItems(protocol);

      for (const item of items) {
        const transformed = this.transformItem({
          protocol,
          item,
          walletAddress,
          timestamp: batchTimestamp,
        });

        if (transformed) {
          results.push(transformed);
        }
      }
    }

    const filteredCount = totalItemsBeforeFilter - results.length;

    if (filteredCount > 0) {
      logger.warn('Portfolio items filtered out', {
        wallet: maskWalletAddress(walletAddress),
        totalItems: totalItemsBeforeFilter,
        validItems: results.length,
        filteredItems: filteredCount,
        reason: 'Invalid numeric values (NaN/Infinity in USD fields)',
      });
    }

    logger.debug('Portfolio transformation complete', {
      wallet: maskWalletAddress(walletAddress),
      protocolsProcessed: protocols.length,
      itemsTransformed: results.length,
    });

    return results;
  }
}
