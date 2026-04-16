import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HyperliquidDataTransformer } from '../../../../src/modules/hyperliquid/transformer.js';
import type { VaultPositionData, VaultAprData, VaultDetailsResponse } from '../../../../src/modules/hyperliquid/fetcher.js';
import { logger } from '../../../../src/utils/logger.js';

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

describe('HyperliquidDataTransformer', () => {
  const transformer = new HyperliquidDataTransformer();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-02-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createVaultDetails = (): VaultDetailsResponse => ({
    vault: 'hlp',
    vaultAddress: '0xvault',
    leader: '0xleader',
    name: 'Hyperliquid Vault',
    description: 'HLP vault',
    apr: 1.5,
    totalVlm: 1_000_000,
    leaderCommission: 0.1,
    leaderFraction: 0.2,
    isClosed: false,
    allowDeposits: true,
    followerState: {
      user: '0xwallet',
      vaultAddress: '0xvault',
      totalAccountValue: '100',
      maxWithdrawable: '10',
      maxDistributable: undefined,
    },
    relationship: {
      type: 'follower',
      data: { since: '2024-01-01' },
    },
    portfolio: [],
    allTime: {},
    totalFollowers: 5,
  });

  it('transforms position data into portfolio snapshot format', () => {
    const details = createVaultDetails();
    const position: VaultPositionData = {
      userWallet: '0xwallet',
      vaultAddress: details.vaultAddress,
      vaultName: details.name ?? 'Hyperliquid Vault',
      hlpBalance: 100,
      vaultUsdValue: 100,
      maxWithdrawable: 10,
      relationshipType: 'follower',
      leaderAddress: '0xleader',
      vaultDescription: 'HLP vault',
    };

    const result = transformer.transformPosition({
      position,
    });

    expect(result).toEqual({
      wallet: '0xwallet',
      chain: 'hyperliquid',
      name: 'hyperliquid',
      name_item: 'Hyperliquid Vault',
      id_raw: '0xvault',
      asset_usd_value: 100,
      detail: {
        vault_address: '0xvault',
        hlp_balance: 100,
        relationship_type: 'follower',
        max_withdrawable: 10,
        description: 'HLP vault',
      },
      snapshot_at: '2025-02-01T12:00:00.000Z',
      has_supported_portfolio: true,
      site_url: 'https://app.hyperliquid.xyz/vaults/0xvault',
      asset_dict: {
        '0xvault': 100,
      },
      asset_token_list: [
        {
          id: '0xvault',
          chain: 'hyperliquid',
          name: 'Hyperliquid Vault',
          symbol: 'HLP',
          price: 1,
          amount: 100,
          is_core: false,
          is_wallet: false,
          is_verified: false,
          protocol_id: 'hyperliquid_vaults',
          decimals: 18,
          time_at: 1738411200,
        },
      ],
      detail_types: ['hyperliquid'],
      pool: {
        id: '0xvault',
        chain: 'hyperliquid',
        index: null,
        time_at: 1738411200,
        adapter_id: 'hyperliquid_vault',
        controller: '0xleader',
        project_id: 'hyperliquid',
      },
      proxy_detail: {},
      debt_usd_value: 0,
      net_usd_value: 100,
      update_at: 1738411200,
    });
  });

  it('should use provided timestamp when available', () => {
    const position = {
      vaultAddress: '0x123',
      userWallet: '0xUser',
      vaultName: 'Test Vault',
      vaultUsdValue: 1000,
      hlpBalance: 10,
      leaderAddress: '0xLeader',
      relationshipType: 'follower',
      maxWithdrawable: 1000,
    } as VaultPositionData;

    const customTimestamp = '2023-01-01T00:00:00.000Z';

    const result = transformer.transformPosition({
      position,
      timestamp: customTimestamp
    });

    expect(result?.snapshot_at).toBe(customTimestamp);
    expect(result?.update_at).toBe(Math.floor(new Date(customTimestamp).getTime() / 1000));
  });

  it('returns null when position data contains invalid numbers', () => {
    const badPosition: VaultPositionData = {
      userWallet: '0xwallet',
      vaultAddress: '0xvault',
      vaultName: 'Hyperliquid Vault',
      hlpBalance: Number.NaN,
      vaultUsdValue: Number.POSITIVE_INFINITY,
      maxWithdrawable: Number.NaN,
      relationshipType: null,
    };

    const result = transformer.transformPosition({ userId: 'user-123', position: badPosition });

    expect(result).toBeNull();
  });

  it('transforms APR data with metadata and snapshot time', () => {
    const details = createVaultDetails();
    const aprData: VaultAprData = {
      vaultAddress: details.vaultAddress,
      vaultName: details.name ?? 'Hyperliquid Vault',
      leaderAddress: details.leader,
      apr: details.apr,
      tvlUsd: details.totalVlm,
      leaderCommission: details.leaderCommission,
      leaderFraction: details.leaderFraction,
      totalFollowers: details.totalFollowers,
      isClosed: false,
      allowDeposits: true,
    };

    const result = transformer.transformApr(aprData, details);

    expect(result).toEqual({
      source: 'hyperliquid',
      vault_address: '0xvault',
      vault_name: 'Hyperliquid Vault',
      leader_address: '0xleader',
      apr: 1.5,
      apr_base: null,
      apr_reward: null,
      tvl_usd: 1_000_000,
      total_followers: 5,
      leader_commission: 0.1,
      leader_fraction: 0.2,
      is_closed: false,
      allow_deposits: true,
      pool_meta: {
        description: 'HLP vault',
        relationship: {
          type: 'follower',
          data: { since: '2024-01-01' },
        },
        total_followers: 5,
      },
      raw_data: details,
      snapshot_time: '2025-02-01T12:00:00.000Z',
    });
  });

  it('throws when APR value is invalid', () => {
    const details = createVaultDetails();
    const aprData: VaultAprData = {
      vaultAddress: details.vaultAddress,
      vaultName: details.name ?? 'Hyperliquid Vault',
      leaderAddress: details.leader,
      apr: Number.NaN,
      tvlUsd: 100,
      leaderCommission: null,
      leaderFraction: null,
      totalFollowers: null,
      isClosed: false,
      allowDeposits: true,
    };

    expect(() => transformer.transformApr(aprData, details)).toThrow('Invalid APR value');
  });

  describe('position transformation edge cases', () => {
    it('handles zero hlpBalance - pricePerShare should be null', () => {
      const position: VaultPositionData = {
        userWallet: '0xwallet',
        vaultAddress: '0xvault',
        vaultName: 'Test Vault',
        hlpBalance: 0,
        vaultUsdValue: 100,
        maxWithdrawable: 0,
        relationshipType: 'follower',
      };

      const result = transformer.transformPosition({ position });

      expect(result).not.toBeNull();
      expect(result!.asset_token_list[0].price).toBeNull();
      expect(result!.asset_token_list[0].amount).toBe(0);
    });

    it('handles negative hlpBalance and vaultUsdValue', () => {
      const position: VaultPositionData = {
        userWallet: '0xwallet',
        vaultAddress: '0xvault',
        vaultName: 'Test Vault',
        hlpBalance: -10,
        vaultUsdValue: -100,
        maxWithdrawable: 0,
        relationshipType: 'follower',
      };

      const result = transformer.transformPosition({ position });

      expect(result).not.toBeNull();
      expect(result!.asset_usd_value).toBe(-100);
      expect(result!.asset_token_list[0].amount).toBe(-10);
    });

    it('handles null position', () => {
      const result = transformer.transformPosition({ position: null });
      expect(result).toBeNull();
    });

    it('handles missing optional fields', () => {
      const position: VaultPositionData = {
        userWallet: '0xwallet',
        vaultAddress: '0xvault',
        vaultName: 'Test Vault',
        hlpBalance: 100,
        vaultUsdValue: 100,
        maxWithdrawable: 10,
        relationshipType: 'follower',
        leaderAddress: undefined,
        vaultDescription: undefined,
      };

      const result = transformer.transformPosition({ position });

      expect(result).not.toBeNull();
      expect(result!.pool.controller).toBeNull();
      expect(result!.detail.description).toBeNull();
    });

    it('handles very large numeric values', () => {
      const position: VaultPositionData = {
        userWallet: '0xwallet',
        vaultAddress: '0xvault',
        vaultName: 'Test Vault',
        hlpBalance: Number.MAX_SAFE_INTEGER,
        vaultUsdValue: Number.MAX_SAFE_INTEGER,
        maxWithdrawable: Number.MAX_SAFE_INTEGER,
        relationshipType: 'follower',
      };

      const result = transformer.transformPosition({ position });

      expect(result).not.toBeNull();
      expect(result!.asset_usd_value).toBe(Number.MAX_SAFE_INTEGER);
      expect(result!.asset_token_list[0].amount).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('handles very small decimal values', () => {
      const position: VaultPositionData = {
        userWallet: '0xwallet',
        vaultAddress: '0xvault',
        vaultName: 'Test Vault',
        hlpBalance: 0.000000001,
        vaultUsdValue: 0.000000001,
        maxWithdrawable: 0.000000001,
        relationshipType: 'follower',
      };

      const result = transformer.transformPosition({ position });

      expect(result).not.toBeNull();
      expect(result!.asset_usd_value).toBe(0.000000001);
      expect(result!.asset_token_list[0].amount).toBe(0.000000001);
    });

    it('handles Infinity maxWithdrawable by setting to null', () => {
      const position: VaultPositionData = {
        userWallet: '0xwallet',
        vaultAddress: '0xvault',
        vaultName: 'Test Vault',
        hlpBalance: 100,
        vaultUsdValue: 100,
        maxWithdrawable: Number.POSITIVE_INFINITY,
        relationshipType: 'follower',
      };

      const result = transformer.transformPosition({ position });

      expect(result).not.toBeNull();
      expect(result!.detail.max_withdrawable).toBeNull();
    });

    it('handles null relationshipType', () => {
      const position: VaultPositionData = {
        userWallet: '0xwallet',
        vaultAddress: '0xvault',
        vaultName: 'Test Vault',
        hlpBalance: 100,
        vaultUsdValue: 100,
        maxWithdrawable: 10,
        relationshipType: null,
      };

      const result = transformer.transformPosition({ position });

      expect(result).not.toBeNull();
      expect(result!.detail.relationship_type).toBeNull();
    });

    it('generates correct vault URL', () => {
      const position: VaultPositionData = {
        userWallet: '0xwallet',
        vaultAddress: '0x123abc',
        vaultName: 'Test Vault',
        hlpBalance: 100,
        vaultUsdValue: 100,
        maxWithdrawable: 10,
        relationshipType: 'follower',
      };

      const result = transformer.transformPosition({ position });

      expect(result).not.toBeNull();
      expect(result!.site_url).toBe('https://app.hyperliquid.xyz/vaults/0x123abc');
    });

    it('transforms batches while filtering null positions', () => {
      const validPosition: VaultPositionData = {
        userWallet: '0xwallet',
        vaultAddress: '0xvault',
        vaultName: 'Test Vault',
        hlpBalance: 50,
        vaultUsdValue: 100,
        maxWithdrawable: 10,
        relationshipType: 'follower',
      };

      const result = transformer.transformBatch([
        { position: validPosition },
        { position: null },
        { position: validPosition },
      ]);

      expect(result).toHaveLength(2);
    });

    it('logs and returns null when snapshot creation throws', () => {
      const malformedPosition = {
        vaultUsdValue: 100,
        hlpBalance: 100,
        vaultAddress: '0x123',
      };

      const result = transformer.transformPosition({
        position: malformedPosition as VaultPositionData
      });

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to transform Hyperliquid position data',
        expect.objectContaining({
          wallet: undefined,
          vault: '0x123'
        })
      );
    });
  });

  describe('APR transformation edge cases', () => {
    it('handles zero APR value', () => {
      const details = createVaultDetails();
      const aprData: VaultAprData = {
        vaultAddress: details.vaultAddress,
        vaultName: details.name ?? 'Hyperliquid Vault',
        leaderAddress: details.leader,
        apr: 0,
        tvlUsd: 100,
        leaderCommission: null,
        leaderFraction: null,
        totalFollowers: null,
        isClosed: false,
        allowDeposits: true,
      };

      const result = transformer.transformApr(aprData, details);

      expect(result.apr).toBe(0);
    });

    it('handles negative APR value', () => {
      const details = createVaultDetails();
      const aprData: VaultAprData = {
        vaultAddress: details.vaultAddress,
        vaultName: details.name ?? 'Hyperliquid Vault',
        leaderAddress: details.leader,
        apr: -0.5,
        tvlUsd: 100,
        leaderCommission: null,
        leaderFraction: null,
        totalFollowers: null,
        isClosed: false,
        allowDeposits: true,
      };

      const result = transformer.transformApr(aprData, details);

      expect(result.apr).toBe(-0.5);
    });

    it('handles very large APR value', () => {
      const details = createVaultDetails();
      const aprData: VaultAprData = {
        vaultAddress: details.vaultAddress,
        vaultName: details.name ?? 'Hyperliquid Vault',
        leaderAddress: details.leader,
        apr: 1000,
        tvlUsd: 100,
        leaderCommission: null,
        leaderFraction: null,
        totalFollowers: null,
        isClosed: false,
        allowDeposits: true,
      };

      const result = transformer.transformApr(aprData, details);

      expect(result.apr).toBe(1000);
    });

    it('handles all null optional fields', () => {
      const details = createVaultDetails();
      const aprData: VaultAprData = {
        vaultAddress: details.vaultAddress,
        vaultName: details.name ?? 'Hyperliquid Vault',
        leaderAddress: details.leader,
        apr: 1.5,
        tvlUsd: null,
        leaderCommission: null,
        leaderFraction: null,
        totalFollowers: null,
        isClosed: false,
        allowDeposits: true,
      };

      const result = transformer.transformApr(aprData, details);

      expect(result.tvl_usd).toBeNull();
      expect(result.leader_commission).toBeNull();
      expect(result.leader_fraction).toBeNull();
      expect(result.total_followers).toBeNull();
    });

    it('handles is_closed and allow_deposits variations', () => {
      const details = createVaultDetails();
      const testCases = [
        { isClosed: true, allowDeposits: false },
        { isClosed: false, allowDeposits: true },
        { isClosed: true, allowDeposits: true },
        { isClosed: false, allowDeposits: false },
      ];

      testCases.forEach((testCase) => {
        const aprData: VaultAprData = {
          vaultAddress: details.vaultAddress,
          vaultName: details.name ?? 'Hyperliquid Vault',
          leaderAddress: details.leader,
          apr: 1.5,
          tvlUsd: 100,
          leaderCommission: 0.1,
          leaderFraction: 0.2,
          totalFollowers: 5,
          isClosed: testCase.isClosed,
          allowDeposits: testCase.allowDeposits,
        };

        const result = transformer.transformApr(aprData, details);

        expect(result.is_closed).toBe(testCase.isClosed);
        expect(result.allow_deposits).toBe(testCase.allowDeposits);
      });
    });

    it('throws for Infinity APR', () => {
      const details = createVaultDetails();
      const aprData: VaultAprData = {
        vaultAddress: details.vaultAddress,
        vaultName: details.name ?? 'Hyperliquid Vault',
        leaderAddress: details.leader,
        apr: Number.POSITIVE_INFINITY,
        tvlUsd: 100,
        leaderCommission: null,
        leaderFraction: null,
        totalFollowers: null,
        isClosed: false,
        allowDeposits: true,
      };

      expect(() => transformer.transformApr(aprData, details)).toThrow('Invalid APR value');
    });

    it('handles very small TVL values', () => {
      const details = createVaultDetails();
      const aprData: VaultAprData = {
        vaultAddress: details.vaultAddress,
        vaultName: details.name ?? 'Hyperliquid Vault',
        leaderAddress: details.leader,
        apr: 1.5,
        tvlUsd: 0.000001,
        leaderCommission: null,
        leaderFraction: null,
        totalFollowers: null,
        isClosed: false,
        allowDeposits: true,
      };

      const result = transformer.transformApr(aprData, details);

      expect(result.tvl_usd).toBe(0.000001);
    });

    it('handles zero totalFollowers', () => {
      const details = createVaultDetails();
      const aprData: VaultAprData = {
        vaultAddress: details.vaultAddress,
        vaultName: details.name ?? 'Hyperliquid Vault',
        leaderAddress: details.leader,
        apr: 1.5,
        tvlUsd: 100,
        leaderCommission: null,
        leaderFraction: null,
        totalFollowers: 0,
        isClosed: false,
        allowDeposits: true,
      };

      const result = transformer.transformApr(aprData, details);

      expect(result.total_followers).toBe(0);
      expect(result.pool_meta.total_followers).toBe(0);
    });

    it('includes raw_data in result', () => {
      const details = createVaultDetails();
      const aprData: VaultAprData = {
        vaultAddress: details.vaultAddress,
        vaultName: details.name ?? 'Hyperliquid Vault',
        leaderAddress: details.leader,
        apr: 1.5,
        tvlUsd: 100,
        leaderCommission: null,
        leaderFraction: null,
        totalFollowers: null,
        isClosed: false,
        allowDeposits: true,
      };

      const result = transformer.transformApr(aprData, details);

      expect(result.raw_data).toBeDefined();
      expect(result.raw_data).toEqual(details);
    });
  });
});
