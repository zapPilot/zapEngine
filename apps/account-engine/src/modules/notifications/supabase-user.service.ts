import { ServiceLayerException } from '@/common/exceptions';
import { BaseService } from '@/database/base.service';
import { DatabaseService } from '@/database/database.service';

import { AnalyticsClientService } from './analytics-client.service';
import { PortfolioNotFoundError } from './errors/portfolio-not-found.error';
import { DailyTrendDataPoint } from './interfaces/portfolio-trend.interface';

export interface SubscribedUser {
  id: string;
  email: string;
  subscription_active: boolean;
}

export interface BalanceHistoryPoint {
  date: Date | string;
  usd_value: number;
}

export interface UserWithWallets {
  user: SubscribedUser;
  wallets: string[];
}

interface WalletRecord {
  wallet: string | null;
}

interface SubscriptionUserRecord {
  id: string;
  email: string | null;
  is_active?: boolean;
  user_crypto_wallets?: WalletRecord[] | WalletRecord | null;
  user_subscriptions?: SubscriptionPlanRecord[] | SubscriptionPlanRecord | null;
}

interface SubscriptionPlanRecord {
  plan_code: string;
  is_canceled: boolean;
  ends_at: string | null;
}

interface SubscriptionRow {
  user_id: string;
  ends_at: string | null;
  users: SubscriptionUserRecord | null;
}

export class SupabaseUserService extends BaseService {
  /* istanbul ignore next -- DI constructor */
  constructor(
    databaseService: DatabaseService,
    private readonly analyticsClientService: AnalyticsClientService,
  ) {
    super(databaseService);
  }

  async getEmailSubscriptions(): Promise<SubscribedUser[]> {
    const subscriptions = await this.fetchVipSubscriptions();
    const usersWithWallets = this.mapSubscriptionsToUsers(subscriptions);
    this.logger.log(`Found ${usersWithWallets.length} VIP subscribers`);
    return usersWithWallets.map((entry) => entry.user);
  }

  async getBalanceHistory(userId: string): Promise<BalanceHistoryPoint[]> {
    try {
      const response =
        await this.analyticsClientService.getPortfolioTrendData(userId);

      const dailyValues = this.extractDailyTrendDataPoints(
        response.daily_values,
      );

      if (dailyValues.length === 0) {
        this.logger.warn(
          `No balance history returned for user ${userId} from analytics service`,
        );
        return [];
      }

      return dailyValues
        .map((entry) => this.mapDailyTrendToHistoryPoint(entry))
        .sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
    } catch (error) {
      if (error instanceof PortfolioNotFoundError) {
        this.logger.warn(
          `No portfolio data found for user ${userId}, returning empty history`,
        );
        return [];
      }
      throw error;
    }
  }

  async getUsersWithAllWallets(): Promise<UserWithWallets[]> {
    const subscriptions = await this.fetchVipSubscriptions();
    const result = this.mapSubscriptionsToUsers(subscriptions);
    this.logger.log(`Found ${result.length} VIP subscribers with wallets`);
    return result;
  }

  async getUserWithWallets(userId: string): Promise<UserWithWallets | null> {
    const subscriptions = await this.fetchVipSubscriptions({ userId });
    const result = this.mapSubscriptionsToUsers(subscriptions);
    return result[0] ?? null;
  }

  private isSubscriptionActive(endsAt: string | null): boolean {
    if (!endsAt) {
      return true;
    }

    const endDate = new Date(endsAt);
    return Number.isNaN(endDate.getTime()) ? false : endDate > new Date();
  }

  private normalizeWallets(
    wallets: WalletRecord[] | WalletRecord | null | undefined,
  ): string[] {
    if (!wallets) {
      return [];
    }

    const walletArray = Array.isArray(wallets) ? wallets : [wallets];
    return walletArray
      .map((entry) => entry.wallet)
      .filter(
        (wallet): wallet is string =>
          typeof wallet === 'string' && wallet.length > 0,
      );
  }

  private async fetchVipSubscriptions(filters?: {
    userId?: string;
  }): Promise<SubscriptionRow[]> {
    let query = this.supabase
      .from('user_subscriptions')
      .select(
        `
        user_id,
        ends_at,
        users!inner(
          id,
          email,
          user_crypto_wallets ( wallet )
        )
      `,
      )
      .eq('plan_code', 'vip')
      .eq('is_canceled', false)
      .eq('users.is_subscribed_to_reports', true)
      .not('users.email', 'is', null);

    if (filters?.userId) {
      query = query.eq('user_id', filters.userId);
    }

    const {
      data,
      error,
    }: {
      data: SubscriptionRow[] | null;
      error: { message: string } | null;
    } = await query;

    if (error) {
      this.logger.error('Error fetching VIP subscribers', error);
      throw new ServiceLayerException(
        `Failed to fetch VIP subscribers: ${error.message}`,
      );
    }

    return data ?? [];
  }

  private mapSubscriptionsToUsers(
    subscriptions: SubscriptionRow[],
  ): UserWithWallets[] {
    const userMap = new Map<string, UserWithWallets>();

    for (const subscription of subscriptions) {
      const userRecord = subscription.users;
      if (!userRecord?.email) {
        continue;
      }

      if (!this.isSubscriptionActive(subscription.ends_at)) {
        continue;
      }

      const wallets = this.normalizeWallets(userRecord.user_crypto_wallets);
      const existing = userMap.get(userRecord.id);

      if (existing) {
        existing.wallets = this.mergeWallets(existing.wallets, wallets);
        continue;
      }

      userMap.set(userRecord.id, {
        user: {
          id: userRecord.id,
          email: userRecord.email,
          subscription_active: true,
        },
        wallets,
      });
    }

    return Array.from(userMap.values());
  }

  private isDailyTrendDataPoint(entry: unknown): entry is DailyTrendDataPoint {
    if (!entry || typeof entry !== 'object') {
      return false;
    }

    const record = entry as Record<string, unknown>;

    // V2 API guarantees standardized fields: date (string) and total_value_usd (number)
    return (
      typeof record['date'] === 'string' &&
      record['date'].length > 0 &&
      typeof record['total_value_usd'] === 'number'
    );
  }

  private extractDailyTrendDataPoints(value: unknown): DailyTrendDataPoint[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((entry): entry is DailyTrendDataPoint =>
      this.isDailyTrendDataPoint(entry),
    );
  }

  private mapDailyTrendToHistoryPoint(
    entry: DailyTrendDataPoint,
  ): BalanceHistoryPoint {
    return {
      date: entry.date,
      usd_value: Math.round(entry.total_value_usd * 100) / 100,
    };
  }

  private mergeWallets(
    existingWallets: string[],
    nextWallets: string[],
  ): string[] {
    return Array.from(new Set([...existingWallets, ...nextWallets]));
  }
}
