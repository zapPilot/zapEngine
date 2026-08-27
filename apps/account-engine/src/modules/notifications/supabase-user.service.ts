import { ServiceLayerException } from '../../common/exceptions';
import { BaseService } from '../../database/base.service';
import { DatabaseService } from '../../database/database.service';
import { AnalyticsClientService } from './analytics-client/client';
import { DailyTrendDataPoint } from './interfaces/portfolio-trend.interface';

export interface ReportRecipient {
  id: string;
  email: string;
}

export interface BalanceHistoryPoint {
  date: Date | string;
  usd_value: number;
}

export interface ReportRecipientWithWallets {
  user: ReportRecipient;
  wallets: string[];
}

interface WalletRecord {
  wallet: string | null;
}

interface ReportRecipientRecord {
  id: string;
  email: string | null;
  user_crypto_wallets?: WalletRecord[] | WalletRecord | null;
}

export class SupabaseUserService extends BaseService {
  /* istanbul ignore next -- DI constructor */
  constructor(
    databaseService: DatabaseService,
    private readonly analyticsClientService: AnalyticsClientService,
  ) {
    super(databaseService);
  }

  async getBalanceHistory(userId: string): Promise<BalanceHistoryPoint[]> {
    const response =
      await this.analyticsClientService.getPortfolioTrendData(userId);

    const dailyValues = this.extractDailyTrendDataPoints(response.daily_values);

    if (dailyValues.length === 0) {
      this.logger.warn(
        `No balance history returned for user ${userId} from analytics service`,
      );
      return [];
    }

    return dailyValues
      .map((entry) => this.mapDailyTrendToHistoryPoint(entry))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async getReportRecipientsWithWallets(
    userIds?: string[],
  ): Promise<ReportRecipientWithWallets[]> {
    const recipients = await this.fetchReportRecipients({ userIds });
    const result = this.mapRecipientsWithWallets(recipients);
    this.logger.log(`Found ${result.length} weekly report recipients`);
    return result;
  }

  async getReportRecipientWithWallets(
    userId: string,
  ): Promise<ReportRecipientWithWallets | null> {
    const recipients = await this.fetchReportRecipients({ userId });
    const result = this.mapRecipientsWithWallets(recipients);
    return result[0] ?? null;
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

  private async fetchReportRecipients(filters?: {
    userId?: string;
    userIds?: string[];
  }): Promise<ReportRecipientRecord[]> {
    let query = this.supabase
      .from('users')
      .select(
        `
        id,
        email,
        user_crypto_wallets ( wallet )
      `,
      )
      .eq('is_subscribed_to_reports', true)
      .not('email', 'is', null);

    if (filters?.userId) {
      query = query.eq('id', filters.userId);
    } else if (filters?.userIds && filters.userIds.length > 0) {
      query = query.in('id', filters.userIds);
    }

    const {
      data,
      error,
    }: {
      data: ReportRecipientRecord[] | null;
      error: { message: string } | null;
    } = await query;

    if (error) {
      this.logger.error('Error fetching weekly report recipients', error);
      throw new ServiceLayerException(
        `Failed to fetch weekly report recipients: ${error.message}`,
      );
    }

    return data ?? [];
  }

  private mapRecipientsWithWallets(
    recipients: ReportRecipientRecord[],
  ): ReportRecipientWithWallets[] {
    return recipients.flatMap((recipient) => {
      if (!recipient.email) {
        return [];
      }

      return [
        {
          user: {
            id: recipient.id,
            email: recipient.email,
          },
          wallets: this.normalizeWallets(recipient.user_crypto_wallets),
        },
      ];
    });
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
}
