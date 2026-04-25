import * as fs from 'node:fs';
import * as path from 'node:path';

import { Logger } from '@/common/logger';
import { formatShortWalletAddress } from '@/common/utils';
import { isWalletAddress } from '@/common/validation/wallet-address.util';

export interface EmailMetrics {
  currentBalance: number;
  estimatedYearlyROI: number;
  estimatedYearlyPnL: number;
  monthlyIncome: number;
  weightedAPR: number;
  walletCount: number;
  recommendedPeriod: string;
  lastUpdated?: Date | string;
  weeklyPnLPercentage?: number;
}

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
    monthlyIncome: number;
    currentBalance: number;
    percentageOfBalance: number;
  } {
    const yearlyROIPercentage = this.toNumber(metrics.estimatedYearlyROI);
    const yearlyPnL = this.toNumber(metrics.estimatedYearlyPnL);
    const monthlyIncome = this.toNumber(metrics.monthlyIncome);
    const currentBalance = this.toNumber(metrics.currentBalance);
    const percentageOfBalance =
      currentBalance > 0 ? (yearlyPnL / currentBalance) * 100 : 0;

    return {
      yearlyROIPercentage,
      yearlyPnL,
      monthlyIncome,
      currentBalance,
      percentageOfBalance,
    };
  }

  /**
   * Build template variables for email
   */
  private buildTemplateVariables(
    userId: string,
    email: string,
    cssStyles: string,
    primaryAddress: string,
    shortAddress: string,
    balanceChartCid: string,
    metrics: EmailMetrics,
    calculatedValues: {
      yearlyROIPercentage: number;
      yearlyPnL: number;
      monthlyIncome: number;
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
      CURRENT_BALANCE: this.formatCurrency(calculatedValues.currentBalance),
      PNL_HERO_CLASS: this.getTrendClass(calculatedValues.yearlyROIPercentage),
      APR_CLASS: this.getTrendClass(calculatedValues.yearlyROIPercentage),
      ESTIMATED_APR: this.formatPercentage(
        calculatedValues.yearlyROIPercentage,
        true,
      ),
      DATA_POINTS_USED: this.formatPeriodLabel(metrics.recommendedPeriod),
      TOTAL_DAYS_ANALYZED: this.formatRecommendedPeriod(
        metrics.recommendedPeriod,
      ),
      WEEKLY_PNL_CLASS: this.getTrendClass(calculatedValues.yearlyPnL),
      WEEKLY_PNL: this.formatCurrency(calculatedValues.yearlyPnL, true),
      WEEKLY_PNL_PERCENTAGE: this.formatPercentage(
        calculatedValues.percentageOfBalance,
        true,
      ),
      MONTHLY_PROFIT_CLASS: this.getTrendClass(calculatedValues.monthlyIncome),
      MONTHLY_PROFIT: this.formatCurrency(calculatedValues.monthlyIncome, true),
      MAX_DRAWDOWN: this.formatDrawdown(metrics.weightedAPR),
      ENCODED_EMAIL: encodeURIComponent(email),
      ENCODED_ADDRESS: encodeURIComponent(primaryAddress),
    };
  }

  /**
   * Replace template placeholders with actual values
   */
  private interpolateTemplate(
    template: string,
    variables: Record<string, string>,
  ): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value);
    }
    return result;
  }

  generateReportHTML(
    userId: string,
    metrics: EmailMetrics,
    email: string,
    balanceChartCid: string,
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
      email,
      cssStyles,
      primaryAddress,
      shortAddress,
      balanceChartCid,
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

  private pickPrimaryAddress(addresses: string[] = []): string {
    const candidate = addresses.find((address) => isWalletAddress(address));
    if (candidate) {
      return candidate;
    }

    return addresses.length > 0 ? (addresses[0] ?? 'N/A') : 'N/A';
  }

  private getTrendClass(value: number): 'positive' | 'negative' | 'neutral' {
    if (value > 0) return 'positive';
    if (value < 0) return 'negative';
    return 'neutral';
  }

  private formatCurrency(value: number, includeSign = false): string {
    const absolute = Math.abs(value).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const formatted = `$${absolute}`;

    if (!includeSign || value === 0) {
      return formatted;
    }

    return value > 0 ? `+${formatted}` : `-${formatted}`;
  }

  private formatPercentage(value: number, includeSign = false): string {
    const absolute = Math.abs(value).toFixed(2) + '%';

    if (!includeSign || value === 0) {
      return absolute;
    }

    return value > 0 ? `+${absolute}` : `-${absolute}`;
  }

  private formatDrawdown(weightedApr: number): string {
    const clamped = Math.max(-100, Math.min(100, weightedApr));
    return `${clamped.toFixed(2)}%`;
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
