import * as utils from '@zapengine/app-core/utils';
import * as chartHoverUtils from '@zapengine/app-core/utils/chartHoverUtils';
import { copyTextToClipboard } from '@zapengine/app-core/utils/clipboard';
import * as formatters from '@zapengine/app-core/utils/formatters';
import { logger } from '@zapengine/app-core/utils/logger';
import * as mathUtils from '@zapengine/app-core/utils/mathUtils';
import { describe, expect, it } from 'vitest';

describe('utils/index barrel export', () => {
  it('should export everything from formatters', () => {
    expect(utils.calculateDataFreshness).toBe(
      formatters.calculateDataFreshness,
    );
    expect(utils.formatAddress).toBe(formatters.formatAddress);
    expect(utils.formatChartDate).toBe(formatters.formatChartDate);
    expect(utils.formatCurrency).toBe(formatters.formatCurrency);
    expect(utils.formatNumber).toBe(formatters.formatNumber);
    expect(utils.formatRelativeTime).toBe(formatters.formatRelativeTime);
    expect(utils.formatters).toBe(formatters.formatters);
  });

  it('should export logger', () => {
    expect(utils.logger).toBe(logger);
  });

  it('should export mathUtils', () => {
    // Check a few math utils
    expect(utils.formatCompactNumber).toBe(mathUtils.formatCompactNumber);
    // Add other math utils checks if needed, or iterate keys if possible
  });

  it('should export copyTextToClipboard', () => {
    expect(utils.copyTextToClipboard).toBe(copyTextToClipboard);
  });

  it('should export chartHoverUtils', () => {
    // Check a few chart utils
    expect(utils.getDrawdownSeverity).toBe(chartHoverUtils.getDrawdownSeverity);
    expect(utils.getSharpeInterpretation).toBe(
      chartHoverUtils.getSharpeInterpretation,
    );
  });
});
