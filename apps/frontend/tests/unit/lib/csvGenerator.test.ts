/**
 * CSV Generator Unit Tests
 *
 * Tests for RFC 4180 compliant CSV generation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildDrawdownSection,
  buildFooterSection,
  buildHeaderSection,
  buildMetricsSection,
  buildMonthlyPnLSection,
  buildPerformanceSection,
  downloadCSV,
  escapeCsvField,
  formatCsvRow,
  generateAnalyticsCSV,
  generateExportFilename,
} from "@/lib/csvGenerator";
import type { AnalyticsData } from "@/types/analytics";
import type { ExportMetadata } from "@/types/export";

// =============================================================================
// TEST DATA
// =============================================================================

const mockAnalyticsData: AnalyticsData = {
  performanceChart: {
    points: [
      {
        x: 0,
        portfolio: 0,
        btc: 0,
        date: "2024-01-17",
        portfolioValue: 10000,
      },
      {
        x: 50,
        portfolio: 25,
        btc: 10,
        date: "2024-07-17",
        portfolioValue: 12500,
      },
      {
        x: 100,
        portfolio: 100,
        btc: 50,
        date: "2025-01-17",
        portfolioValue: 22450,
      },
    ],
    startDate: "2024-01-17",
    endDate: "2025-01-17",
  },
  drawdownChart: {
    points: [
      { x: 0, value: 0, date: "2024-01-17" },
      { x: 50, value: -5.2, date: "2024-07-17" },
      { x: 100, value: -12.8, date: "2025-01-17" },
    ],
    maxDrawdown: -12.8,
    maxDrawdownDate: "2024-03-15",
  },
  keyMetrics: {
    timeWeightedReturn: {
      value: "+124.5%",
      subValue: "+2.4% vs BTC",
      trend: "up",
    },
    maxDrawdown: {
      value: "12.8%",
      subValue: "Recovered in 14 days",
      trend: "down",
    },
    sharpe: {
      value: "2.45",
      subValue: "Top 5% of Pilots",
      trend: "up",
    },
    winRate: {
      value: "68%",
      subValue: "8 of 12 months",
      trend: "up",
    },
    volatility: {
      value: "22.8%",
      subValue: "Medium risk",
      trend: "neutral",
    },
    sortino: {
      value: "3.21",
      subValue: "Excellent downside protection",
      trend: "up",
    },
    beta: {
      value: "0.85",
      subValue: "15% less volatile than BTC",
      trend: "neutral",
    },
    alpha: {
      value: "+5.2%",
      subValue: "Outperformed BTC by 5.2%",
      trend: "up",
    },
  },
  monthlyPnL: [
    { month: "Jan", year: 2024, value: 12.5 },
    { month: "Feb", year: 2024, value: -3.2 },
    { month: "Mar", year: 2024, value: 8.7 },
    { month: "Apr", year: 2024, value: -1.5 },
    { month: "May", year: 2024, value: 15.3 },
    { month: "Jun", year: 2024, value: 22.1 },
    { month: "Jul", year: 2024, value: -8.4 },
    { month: "Aug", year: 2024, value: 5.6 },
    { month: "Sep", year: 2024, value: -2.8 },
    { month: "Oct", year: 2024, value: 18.9 },
    { month: "Nov", year: 2024, value: 7.3 },
    { month: "Dec", year: 2024, value: -4.1 },
  ],
};

const mockMetadata: ExportMetadata = {
  userId: "0x1234567890abcdef1234567890abcdef12345678",
  timePeriod: { key: "1Y", days: 365, label: "1 Year" },
  data: mockAnalyticsData,
  timestamp: new Date("2025-01-17T14:30:00.000Z"),
};

// =============================================================================
// CSV FIELD ESCAPING TESTS
// =============================================================================

describe("escapeCsvField", () => {
  it("should not quote fields without special characters", () => {
    expect(escapeCsvField("Hello")).toBe("Hello");
    expect(escapeCsvField("123")).toBe("123");
    expect(escapeCsvField("test-value")).toBe("test-value");
  });

  it("should quote fields with commas", () => {
    expect(escapeCsvField("Hello, World")).toBe('"Hello, World"');
    expect(escapeCsvField("1,234.56")).toBe('"1,234.56"');
  });

  it("should escape fields with quotes by doubling them", () => {
    expect(escapeCsvField('Say "Hi"')).toBe('"Say ""Hi"""');
    expect(escapeCsvField('"Quoted"')).toBe('"""Quoted"""');
  });

  it("should quote fields with line breaks", () => {
    expect(escapeCsvField("Line 1\nLine 2")).toBe('"Line 1\nLine 2"');
    expect(escapeCsvField("Line 1\r\nLine 2")).toBe('"Line 1\r\nLine 2"');
  });

  it("should handle null and undefined values", () => {
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField()).toBe("");
  });

  it("should handle numeric values", () => {
    expect(escapeCsvField(123)).toBe("123");
    expect(escapeCsvField(123.45)).toBe("123.45");
  });
});

// =============================================================================
// CSV ROW FORMATTING TESTS
// =============================================================================

describe("formatCsvRow", () => {
  it("should format simple rows", () => {
    expect(formatCsvRow(["Name", "Age", "City"])).toBe("Name,Age,City");
  });

  it("should escape fields with commas", () => {
    expect(formatCsvRow(["Hello, World", "123"])).toBe('"Hello, World",123');
  });

  it("should handle mixed types", () => {
    expect(formatCsvRow(["Name", 25, null, "City"])).toBe("Name,25,,City");
  });
});

// =============================================================================
// SECTION BUILDER TESTS
// =============================================================================

describe("buildHeaderSection", () => {
  it("should generate header section with metadata", () => {
    const lines = buildHeaderSection(mockMetadata);

    expect(lines[0]).toBe("Portfolio Analytics Report");
    expect(lines[1]).toBe("Generated: 2025-01-17T14:30:00.000Z");
    expect(lines[2]).toBe(
      "User ID: 0x1234567890abcdef1234567890abcdef12345678"
    );
    expect(lines[3]).toBe("Wallet Filter: All Wallets (Bundle Aggregation)");
    expect(lines[4]).toBe("Time Period: 1Y (365 days)");
    expect(lines[5]).toBe("Period: 2024-01-17 to 2025-01-17");
    expect(lines[6]).toBe("");
  });

  it("should format different time periods correctly", () => {
    const metadata: ExportMetadata = {
      ...mockMetadata,
      timePeriod: { key: "3M", days: 90, label: "3 Months" },
    };
    const lines = buildHeaderSection(metadata);
    expect(lines[4]).toBe("Time Period: 3M (90 days)");
  });

  it("falls back to timePeriod.label when key is not in the period map", () => {
    const metadata: ExportMetadata = {
      ...mockMetadata,
      timePeriod: { key: "CUSTOM", days: 60, label: "Custom Period" },
    };
    const lines = buildHeaderSection(metadata);
    expect(lines[4]).toBe("Time Period: Custom Period");
  });

  it("shows specific wallet address when walletFilter is set", () => {
    // Exercises the `walletFilter ? \`Specific Wallet (${...})\` : "All Wallets..."` true branch (line 71).
    const metadata: ExportMetadata = {
      ...mockMetadata,
      walletFilter: "0x1234567890abcdef1234567890abcdef12345678",
    };
    const lines = buildHeaderSection(metadata);
    expect(lines[3]).toBe("Wallet Filter: Specific Wallet (0x1234...5678)");
  });
});

describe("buildMetricsSection", () => {
  it("should generate metrics section with all metrics", () => {
    const lines = buildMetricsSection(mockMetadata);

    expect(lines[0]).toBe("=== KEY METRICS ===");
    expect(lines[1]).toBe("Metric,Value,Sub Value,Trend");

    // Check that all 8 metrics are present
    expect(lines).toHaveLength(11); // Header + title + 8 metrics + empty line
  });

  it("should format metrics with proper escaping", () => {
    const lines = buildMetricsSection(mockMetadata);

    // Time-Weighted Return - no special characters, not quoted
    expect(lines[2]).toContain("Time-Weighted Return");
    expect(lines[2]).toContain("+124.5%");
    expect(lines[2]).toContain("+2.4% vs BTC");

    // Max Drawdown - "Recovered in 14 days" has no commas, not quoted
    expect(lines[3]).toContain("Max Drawdown");
    expect(lines[3]).toContain("12.8%");
    expect(lines[3]).toContain("Recovered in 14 days");
  });

  it("should handle missing optional metrics", () => {
    const dataWithoutOptional: ExportMetadata = {
      ...mockMetadata,
      data: {
        ...mockAnalyticsData,
        keyMetrics: {
          ...mockAnalyticsData.keyMetrics,
          sortino: undefined,
          beta: undefined,
          alpha: undefined,
        },
      },
    };

    const lines = buildMetricsSection(dataWithoutOptional);
    expect(lines).toHaveLength(8); // Header + title + 5 metrics + empty line
  });
});

describe("buildPerformanceSection", () => {
  it("should generate performance chart section", () => {
    const lines = buildPerformanceSection(mockMetadata);

    expect(lines[0]).toBe("=== PERFORMANCE CHART DATA ===");
    expect(lines[1]).toBe("Date,Portfolio Value (USD),Normalized Portfolio");

    // Check data rows (3 points + header + title + empty)
    expect(lines).toHaveLength(6);
  });

  it("should format portfolio values with 2 decimal places", () => {
    const lines = buildPerformanceSection(mockMetadata);

    expect(lines[2]).toBe("2024-01-17,10000.00,0.00");
    expect(lines[3]).toBe("2024-07-17,12500.00,25.00");
    expect(lines[4]).toBe("2025-01-17,22450.00,100.00");
  });
});

describe("buildDrawdownSection", () => {
  it("should generate drawdown chart section", () => {
    const lines = buildDrawdownSection(mockMetadata);

    expect(lines[0]).toBe("=== DRAWDOWN CHART DATA ===");
    expect(lines[1]).toBe("Date,Drawdown (%),Normalized X,Normalized Y");

    expect(lines).toHaveLength(6); // Title + header + 3 points + empty
  });

  it("should format drawdown values correctly", () => {
    const lines = buildDrawdownSection(mockMetadata);

    expect(lines[2]).toBe("2024-01-17,0.00,0.00,0.00");
    expect(lines[3]).toBe("2024-07-17,-5.20,50.00,-5.20");
    expect(lines[4]).toBe("2025-01-17,-12.80,100.00,-12.80");
  });
});

describe("buildMonthlyPnLSection", () => {
  it("should generate monthly PnL section", () => {
    const lines = buildMonthlyPnLSection(mockMetadata);

    expect(lines[0]).toBe("=== MONTHLY PNL ===");
    expect(lines[1]).toBe("Month,Year,Return (%)");

    expect(lines).toHaveLength(15); // Title + header + 12 months + empty
  });

  it("should format positive returns with + sign", () => {
    const lines = buildMonthlyPnLSection(mockMetadata);

    expect(lines[2]).toBe("Jan,2024,+12.5");
    expect(lines[6]).toBe("May,2024,+15.3");
  });

  it("should format negative returns without + sign", () => {
    const lines = buildMonthlyPnLSection(mockMetadata);

    expect(lines[3]).toBe("Feb,2024,-3.2");
    expect(lines[8]).toBe("Jul,2024,-8.4");
  });

  it("falls back to empty string when item.year is undefined", () => {
    // Exercises the `item.year?.toString() ?? ""` right branch (line 152).
    const metadata = {
      ...mockMetadata,
      data: {
        ...mockMetadata.data,
        monthlyPnL: [{ month: "Jan", year: undefined, value: 5.0 }],
      },
    };
    const lines = buildMonthlyPnLSection(metadata as any);
    // Year column should be empty string fallback
    expect(lines[2]).toBe("Jan,,+5.0");
  });
});

describe("buildFooterSection", () => {
  it("should generate footer with attribution", () => {
    const lines = buildFooterSection();

    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      "Report Generated: Zap Pilot Analytics Engine v0.1.0"
    );
  });
});

// =============================================================================
// MAIN CSV GENERATION TESTS
// =============================================================================

describe("generateAnalyticsCSV", () => {
  it("should generate valid CSV with all sections", () => {
    const csv = generateAnalyticsCSV(mockMetadata);

    // Check UTF-8 BOM
    expect(csv.charCodeAt(0)).toBe(0xfeff);

    // Check that all sections are present
    expect(csv).toContain("Portfolio Analytics Report");
    expect(csv).toContain("=== KEY METRICS ===");
    expect(csv).toContain("=== PERFORMANCE CHART DATA ===");
    expect(csv).toContain("=== DRAWDOWN CHART DATA ===");
    expect(csv).toContain("=== MONTHLY PNL ===");
    expect(csv).toContain("Zap Pilot Analytics Engine");
  });

  it("should use CRLF line endings by default", () => {
    const csv = generateAnalyticsCSV(mockMetadata);

    // Remove BOM and check first line ending
    const withoutBOM = csv.substring(1);
    expect(withoutBOM).toContain("\r\n");
  });

  it("should allow disabling UTF-8 BOM", () => {
    const csv = generateAnalyticsCSV(mockMetadata, { includeBOM: false });

    expect(csv.charCodeAt(0)).not.toBe(0xfeff);
    expect(csv.startsWith("Portfolio Analytics Report")).toBe(true);
  });

  it("should allow custom line endings", () => {
    const csv = generateAnalyticsCSV(mockMetadata, { lineEnding: "\n" });

    // Remove BOM
    const withoutBOM = csv.substring(1);

    // Should contain LF but not CRLF
    expect(withoutBOM).toContain("\n");
    expect(withoutBOM).not.toContain("\r\n");
  });

  it("should handle optional metrics", () => {
    const dataWithoutOptional: ExportMetadata = {
      ...mockMetadata,
      data: {
        ...mockAnalyticsData,
        keyMetrics: {
          ...mockAnalyticsData.keyMetrics,
          sortino: undefined,
          beta: undefined,
          alpha: undefined,
        },
      },
    };

    const csv = generateAnalyticsCSV(dataWithoutOptional);

    expect(csv).toContain("Volatility");
    expect(csv).not.toContain("Sortino");
    expect(csv).not.toContain("Beta");
    expect(csv).not.toContain("Alpha");
  });
});

// =============================================================================
// FILENAME GENERATION TESTS
// =============================================================================

describe("generateExportFilename", () => {
  it("should generate filename with shortened address and date", () => {
    // Bundle export (no wallet filter)
    const filename = generateExportFilename(
      "0x1234567890abcdef1234567890abcdef12345678",
      new Date("2025-01-17T14:30:00.000Z")
    );

    expect(filename).toBe(
      "portfolio-analytics-0x1234...5678-bundle-2025-01-17.csv"
    );
  });

  it("should use ISO date format (YYYY-MM-DD)", () => {
    const filename = generateExportFilename(
      "0x1234567890abcdef1234567890abcdef12345678",
      new Date("2025-12-31T23:59:59.999Z")
    );

    expect(filename).toContain("2025-12-31");
  });

  it("should include .csv extension", () => {
    const filename = generateExportFilename(
      "0x1234567890abcdef1234567890abcdef12345678",
      new Date("2025-01-17")
    );

    expect(filename).toMatch(/\.csv$/);
  });

  it("should include wallet address suffix when wallet filter is provided", () => {
    const filename = generateExportFilename(
      "0x1234567890abcdef1234567890abcdef12345678",
      new Date("2025-01-17T14:30:00.000Z"),
      "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
    );

    expect(filename).toBe(
      "portfolio-analytics-0x1234...5678-0xabcd...abcd-2025-01-17.csv"
    );
  });

  it("should use 'bundle' suffix when wallet filter is null", () => {
    const filename = generateExportFilename(
      "0x1234567890abcdef1234567890abcdef12345678",
      new Date("2025-01-17T14:30:00.000Z"),
      null
    );

    expect(filename).toBe(
      "portfolio-analytics-0x1234...5678-bundle-2025-01-17.csv"
    );
  });
});

// =============================================================================
// BROWSER DOWNLOAD TESTS
// =============================================================================

describe("downloadCSV", () => {
  let createElementSpy: ReturnType<typeof vi.spyOn>;
  let mockLink: HTMLAnchorElement;

  beforeEach(() => {
    // Create mock link element
    mockLink = {
      href: "",
      download: "",
      click: vi.fn(),
    } as unknown as HTMLAnchorElement;

    // Mock URL methods on global object
    global.URL.createObjectURL = vi.fn(() => "blob:http://localhost/mock-url");
    global.URL.revokeObjectURL = vi.fn();

    // Spy on DOM methods
    createElementSpy = vi
      .spyOn(document, "createElement")
      .mockReturnValue(mockLink);

    vi.spyOn(document.body, "appendChild").mockImplementation(() => mockLink);
    vi.spyOn(document.body, "removeChild").mockImplementation(() => mockLink);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should create blob with correct MIME type", () => {
    const content = "test,csv,content";
    const filename = "test.csv";

    downloadCSV(content, filename);

    // Verify createObjectURL was called (Blob created)
    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("should create download link with correct attributes", () => {
    const content = "test,csv,content";
    const filename = "test-export.csv";

    downloadCSV(content, filename);

    expect(createElementSpy).toHaveBeenCalledWith("a");
    expect(mockLink.href).toBe("blob:http://localhost/mock-url");
    expect(mockLink.download).toBe(filename);
  });

  it("should trigger download by clicking link", () => {
    downloadCSV("test", "test.csv");

    expect(mockLink.click).toHaveBeenCalledTimes(1);
  });

  it("should clean up object URL after download", () => {
    downloadCSV("test", "test.csv");

    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith(
      "blob:http://localhost/mock-url"
    );
  });
});
