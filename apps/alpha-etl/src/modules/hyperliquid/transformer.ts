import { transformBatchWithLogging } from '../../core/transformers/baseTransformer.js';
import { logger } from '../../utils/logger.js';
import { toErrorMessage } from '../../utils/errors.js';
import { resolveSnapshotTime } from '../../utils/dateUtils.js';
import { isFiniteNumber, toFiniteNumberOrNull } from '../../utils/numberUtils.js';
import type { VaultAprData, VaultDetailsResponse, VaultPositionData } from '../../modules/hyperliquid/fetcher.js';
import type { PortfolioItemSnapshotInsert, HyperliquidVaultAprSnapshotInsert } from '../../types/database.js';

export interface TransformPositionParams {
  position: VaultPositionData | null;
  timestamp?: string;
}

/**
 * Transforms Hyperliquid vault API responses into portfolio and APR snapshots.
 */
export class HyperliquidDataTransformer {
  transformPosition({ position, timestamp }: TransformPositionParams): PortfolioItemSnapshotInsert | null {
    if (!position) {
      return null;
    }

    if (!this.validatePosition(position)) {
      return null;
    }

    try {
      const { snapshotAt, epochSeconds } = resolveSnapshotTime(timestamp);

      return this.createSnapshot(position, snapshotAt, epochSeconds);
    } catch (error) {
      logger.error('Failed to transform Hyperliquid position data', {
        error: toErrorMessage(error),
        wallet: position.userWallet,
        vault: position.vaultAddress,
      });
      return null;
    }
  }

  private validatePosition(position: VaultPositionData): boolean {
    if (!isFiniteNumber(position.vaultUsdValue) || !isFiniteNumber(position.hlpBalance)) {
      logger.warn('Hyperliquid position contains invalid numeric values', {
        wallet: position.userWallet,
        vault: position.vaultAddress,
        vaultUsdValue: position.vaultUsdValue,
        hlpBalance: position.hlpBalance,
      });
      return false;
    }
    return true;
  }

  private resolvePricePerShare(position: VaultPositionData): number | null {
    if (position.hlpBalance <= 0) {
      return null;
    }

    return position.vaultUsdValue / position.hlpBalance;
  }

  private buildPositionDetail(position: VaultPositionData): Record<string, unknown> {
    return {
      vault_address: position.vaultAddress,
      hlp_balance: position.hlpBalance,
      relationship_type: position.relationshipType,
      max_withdrawable: toFiniteNumberOrNull(position.maxWithdrawable),
      description: position.vaultDescription ?? null,
    };
  }

  private buildAssetTokenList(position: VaultPositionData, epochSeconds: number): Array<Record<string, unknown>> {
    const pricePerShare = this.resolvePricePerShare(position);
    return [
      {
        id: position.vaultAddress,
        chain: 'hyperliquid',
        name: position.vaultName,
        symbol: 'HLP',
        price: pricePerShare,
        amount: position.hlpBalance,
        is_core: false,
        is_wallet: false,
        is_verified: false,
        protocol_id: 'hyperliquid_vaults',
        decimals: 18,
        time_at: epochSeconds,
      },
    ];
  }

  private buildPoolInfo(position: VaultPositionData, epochSeconds: number): Record<string, unknown> {
    return {
      id: position.vaultAddress,
      chain: 'hyperliquid',
      index: null,
      time_at: epochSeconds,
      adapter_id: 'hyperliquid_vault',
      controller: position.leaderAddress ?? null,
      project_id: 'hyperliquid',
    };
  }

  private createSnapshot(position: VaultPositionData, snapshotAt: string, epochSeconds: number): PortfolioItemSnapshotInsert {
    const assetDict = this.buildAssetDict(position);
    const vaultSiteUrl = this.buildVaultSiteUrl(position.vaultAddress);

    return {
      wallet: position.userWallet.toLowerCase(),
      chain: 'hyperliquid',
      name: 'hyperliquid',
      name_item: position.vaultName,
      id_raw: position.vaultAddress,
      asset_usd_value: position.vaultUsdValue,
      detail: this.buildPositionDetail(position),
      snapshot_at: snapshotAt,
      has_supported_portfolio: true,
      site_url: vaultSiteUrl,
      asset_dict: assetDict,
      asset_token_list: this.buildAssetTokenList(position, epochSeconds),
      detail_types: ['hyperliquid'],
      pool: this.buildPoolInfo(position, epochSeconds),
      proxy_detail: {},
      debt_usd_value: 0,
      net_usd_value: position.vaultUsdValue,
      update_at: epochSeconds,
    };
  }

  transformBatch(params: TransformPositionParams[]): PortfolioItemSnapshotInsert[] {
    return transformBatchWithLogging(
      params,
      (item) => this.transformPosition(item),
      'Hyperliquid position'
    );
  }

  transformApr(aprData: VaultAprData, raw: VaultDetailsResponse): HyperliquidVaultAprSnapshotInsert {
    const snapshotTime = this.getSnapshotTime();
    const aprValue = this.toValidAprValue(aprData);

    return {
      source: 'hyperliquid',
      vault_address: aprData.vaultAddress,
      vault_name: aprData.vaultName,
      leader_address: aprData.leaderAddress,
      apr: aprValue,
      apr_base: null,
      apr_reward: null,
      tvl_usd: aprData.tvlUsd ?? null,
      total_followers: aprData.totalFollowers ?? null,
      leader_commission: aprData.leaderCommission ?? null,
      leader_fraction: aprData.leaderFraction ?? null,
      is_closed: aprData.isClosed,
      allow_deposits: aprData.allowDeposits,
      pool_meta: this.buildAprPoolMeta(aprData, raw),
      raw_data: raw as unknown as Record<string, unknown>,
      snapshot_time: snapshotTime,
    };
  }

  private buildAssetDict(position: VaultPositionData): Record<string, number> {
    return {
      [position.vaultAddress]: position.hlpBalance,
    };
  }

  private buildVaultSiteUrl(vaultAddress: string): string {
    return `https://app.hyperliquid.xyz/vaults/${vaultAddress}`;
  }

  private getSnapshotTime(): string {
    return new Date().toISOString();
  }

  private toValidAprValue(aprData: VaultAprData): number {
    const aprValue = Number(aprData.apr);
    if (Number.isFinite(aprValue)) {
      return aprValue;
    }

    logger.warn('Invalid APR value received from Hyperliquid', {
      vault: aprData.vaultAddress,
      apr: aprData.apr,
    });
    throw new Error('Invalid APR value');
  }

  private buildAprPoolMeta(
    aprData: VaultAprData,
    raw: VaultDetailsResponse
  ): Record<string, unknown> {
    return {
      description: raw.description,
      relationship: raw.relationship,
      total_followers: aprData.totalFollowers ?? null,
    };
  }

}
