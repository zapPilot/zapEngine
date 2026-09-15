import * as fs from 'node:fs';
import * as path from 'node:path';

import { Logger } from '../../common/logger';
import { formatShortWalletAddress } from '../../common/utils';
import { isWalletAddress } from '../../common/validation/wallet-address.util';
import { formatUsdAmount } from './message-format.util';

export interface EmailMetrics {
  currentBalance: number;
  estimatedYearlyROI: number;
  estimatedYearlyPnL: number;
  walletCount: number;
  recommendedPeriod: string;
  lastUpdated?: Date | string;
  weeklyPnLPercentage?: number;
}

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);
  private readonly templatesPath = path.join(process.cwd(), 'templates');
  private readonly htmlTemplatePath = path.join(
    this.templatesPath,
    'email.html',
  );
  private readonly cssPath = path.join(this.templatesPath, 'email.css');
  private readonly templateCache = new Map<string, string>();

  /**
   * Load template files (HTML and CSS)
   */
  private loadTemplateFiles(): { html: string; css: string } {
    const html = this.loadFile(this.htmlTemplatePath, 'HTML');
    const css = this.loadFile(this.cssPath, 'CSS');
    return { html, css };
  }

  /**
   * Calculate metric values from raw metrics
   */
  private calculateMetricsValues(metrics: EmailMetrics): {
    yearlyROIPercentage: number;
    yearlyPnL: number;
    currentBalance: number;
    percentageOfBalance: number;
  } {
    const yearlyROIPercentage = this.toNumber(metrics.estimatedYearlyROI);
    const yearlyPnL = this.toNumber(metrics.estimatedYearlyPnL);
    const currentBalance = this.toNumber(metrics.currentBalance);
    const percentageOfBalance =
      currentBalance > 0 ? (yearlyPnL / currentBalance) * 100 : 0;

    return {
      yearlyROIPercentage,
      yearlyPnL,
      currentBalance,
      percentageOfBalance,
    };
  }

  /**
   * Build template variables for email
   */
  private buildTemplateVariables(
    userId: string,
    cssStyles: string,
    primaryAddress: string,
    shortAddress: string,
    balanceChartCid: string,
    unsubscribeUrl: string,
    metrics: EmailMetrics,
    calculatedValues: {
      yearlyROIPercentage: number;
      yearlyPnL: number;
      currentBalance: number;
      percentageOfBalance: number;
    },
  ): Record<string, string> {
    return {
      CSS_STYLES: cssStyles,
      USER_ID: userId,
      SHORT_ADDRESS: shortAddress,
      ADDRESS: primaryAddress,
      BALANCE_CHART_CID: balanceChartCid,
      CURRENT_BALANCE: formatUsdAmount(calculatedValues.currentBalance, {
        fractionDigits: 2,
      }),
      PNL_HERO_CLASS: this.getTrendClass(calculatedValues.yearlyROIPercentage),
      APR_CLASS: this.getTrendClass(calculatedValues.yearlyROIPercentage),
      ESTIMATED_APR: this.formatPercentage(
        calculatedValues.yearlyROIPercentage,
      ),
      DATA_POINTS_USED: this.formatPeriodLabel(metrics.recommendedPeriod),
      TOTAL_DAYS_ANALYZED: this.formatRecommendedPeriod(
        metrics.recommendedPeriod,
      ),
      WEEKLY_PNL_CLASS: this.getTrendClass(calculatedValues.yearlyPnL),
      WEEKLY_PNL: formatUsdAmount(calculatedValues.yearlyPnL, {
        fractionDigits: 2,
        includeSign: true,
      }),
      WEEKLY_PNL_PERCENTAGE: this.formatPercentage(
        calculatedValues.percentageOfBalance,
      ),
      UNSUBSCRIBE_URL: unsubscribeUrl,
    };
  }

  /**
   * Replace template placeholders with actual values.
   *
   * One pass over the template instead of one compiled RegExp and one full
   * scan per variable. The callback form also stops `$&`-style sequences in a
   * value (a wallet address, a formatted amount) from being read as replacement
   * patterns, and stops one value's text from being re-scanned for another
   * placeholder. Unknown placeholders are left untouched, as before.
   */
  private interpolateTemplate(
    template: string,
    variables: Record<string, string>,
  ): string {
    return template.replace(PLACEHOLDER_PATTERN, (match, key: string) =>
      Object.prototype.hasOwnProperty.call(variables, key)
        ? // hasOwnProperty implies a present string value — assert instead of
          // an impossible `?? match` fallback.
          variables[key]!
        : match,
    );
  }

  generateReportHTML(
    userId: string,
    metrics: EmailMetrics,
    balanceChartCid: string,
    unsubscribeUrl: string,
    allWalletAddresses: string[] = [],
  ): string {
    // Load template files
    const { html: htmlTemplate, css: cssStyles } = this.loadTemplateFiles();
    if (!htmlTemplate) {
      return '';
    }

    // Prepare address information
    const primaryAddress = this.pickPrimaryAddress(allWalletAddresses);
    const shortAddress = formatShortWalletAddress(primaryAddress);

    // Calculate metric values
    const calculatedValues = this.calculateMetricsValues(metrics);

    // Build template variables
    const templateVars = this.buildTemplateVariables(
      userId,
      cssStyles,
      primaryAddress,
      shortAddress,
      balanceChartCid,
      unsubscribeUrl,
      metrics,
      calculatedValues,
    );

    // Replace placeholders and return
    return this.interpolateTemplate(htmlTemplate, templateVars);
  }

  calculateRiskScore(maxDrawdownPercentage: number): string {
    if (maxDrawdownPercentage < 5) return 'Low';
    if (maxDrawdownPercentage < 15) return 'Medium';
    if (maxDrawdownPercentage < 30) return 'High';
    return 'Very High';
  }

  private loadFile(filePath: string, label: 'HTML' | 'CSS'): string {
    const cached = this.templateCache.get(filePath);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      this.templateCache.set(filePath, content);
      return content;
    } catch (error) {
      this.logger.error(
        `Error loading ${label} template at ${filePath}`,
        error,
      );
      return '';
    }
  }

  private pickPrimaryAddress(addresses: string[]): string {
    const candidate = addresses.find((address) => isWalletAddress(address));
    if (candidate) {
      return candidate;
    }

    // The only caller always passes an array (its own parameter defaults to
    // []), and a non-empty array guarantees element 0 exists — assert instead
    // of carrying an impossible `?? 'N/A'` fallback.
    return addresses.length > 0 ? addresses[0]! : 'N/A';
  }

  private getTrendClass(value: number): 'positive' | 'negative' | 'neutral' {
    if (value > 0) return 'positive';
    if (value < 0) return 'negative';
    return 'neutral';
  }

  private formatPercentage(value: number): string {
    const absolute = Math.abs(value).toFixed(2) + '%';

    // Both call sites always want the sign, so the old includeSign flag was a
    // permanently-true parameter; zero keeps its unsigned rendering.
    if (value === 0) {
      return absolute;
    }

    return value > 0 ? `+${absolute}` : `-${absolute}`;
  }

  private formatRecommendedPeriod(recommendedPeriod: string): string {
    if (!recommendedPeriod) {
      return 'N/A';
    }

    const match = /(\d+)/.exec(recommendedPeriod);
    if (!match) {
      return 'N/A';
    }

    const days = Number(match[1]);
    if (days <= 0) {
      return 'N/A';
    }

    return `${days} days`;
  }

  private toNumber(value: number | undefined | null): number {
    return typeof value === 'number' ? value : 0;
  }

  private formatPeriodLabel(recommendedPeriod: string): string {
    if (!recommendedPeriod) {
      return 'N/A';
    }

    return recommendedPeriod.replace(/_/g, ' ').toUpperCase();
  }

  clearTemplateCache(): void {
    this.templateCache.clear();
  }
}
