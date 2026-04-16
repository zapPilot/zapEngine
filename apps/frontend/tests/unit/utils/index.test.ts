import { describe, expect, it } from "vitest";

import * as utils from "@/utils";
import * as chartHoverUtils from "@/utils/chartHoverUtils";
import { copyTextToClipboard } from "@/utils/clipboard";
import * as formatters from "@/utils/formatters";
import { logger } from "@/utils/logger";
import * as mathUtils from "@/utils/mathUtils";

describe("utils/index barrel export", () => {
  it("should export everything from formatters", () => {
    expect(utils.calculateDataFreshness).toBe(
      formatters.calculateDataFreshness
    );
    expect(utils.formatAddress).toBe(formatters.formatAddress);
    expect(utils.formatChartDate).toBe(formatters.formatChartDate);
    expect(utils.formatCurrency).toBe(formatters.formatCurrency);
    expect(utils.formatNumber).toBe(formatters.formatNumber);
    expect(utils.formatRelativeTime).toBe(formatters.formatRelativeTime);
    expect(utils.formatters).toBe(formatters.formatters);
  });

  it("should export logger", () => {
    expect(utils.logger).toBe(logger);
  });

  it("should export mathUtils", () => {
    // Check a few math utils
    expect(utils.formatCompactNumber).toBe(mathUtils.formatCompactNumber);
    // Add other math utils checks if needed, or iterate keys if possible
  });

  it("should export copyTextToClipboard", () => {
    expect(utils.copyTextToClipboard).toBe(copyTextToClipboard);
  });

  it("should export chartHoverUtils", () => {
    // Check a few chart utils
    expect(utils.getDrawdownSeverity).toBe(chartHoverUtils.getDrawdownSeverity);
    expect(utils.getSharpeInterpretation).toBe(
      chartHoverUtils.getSharpeInterpretation
    );
  });
});
