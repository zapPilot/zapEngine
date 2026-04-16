/**
 * Analytics Export Service
 *
 * Service layer for exporting analytics data to various formats
 *
 * Architecture: Service layer for orchestrating export operations
 * Pure validation utilities moved to @/lib/analytics for better separation
 */

import {
  downloadCSV,
  generateAnalyticsCSV,
  generateExportFilename,
} from "@/lib/csvGenerator";
import type {
  AnalyticsData,
  AnalyticsTimePeriod,
  WalletFilter,
} from "@/types/analytics";
import type { ExportMetadata, ExportResult } from "@/types/export";
import { logger } from "@/utils/logger";

// =============================================================================
// EXPORT FUNCTIONS
// =============================================================================

/**
 * Export analytics data to CSV format
 *
 * Service function: Orchestrates validation, CSV generation, and browser download
 *
 * @param userId - User wallet address
 * @param data - Analytics data to export
 * @param timePeriod - Selected time period
 * @param walletFilter - Optional wallet address filter (null = all wallets, string = specific wallet)
 * @returns Promise resolving to export result with success status and optional error
 *
 * @example
 * // Bundle-level export (all wallets)
 * const bundleResult = await exportAnalyticsToCSV(
 *   '0x1234...5678',
 *   analyticsData,
 *   { key: '1Y', days: 365, label: '1Y' }
 * );
 *
 * // Wallet-specific export
 * const walletResult = await exportAnalyticsToCSV(
 *   '0x1234...5678',
 *   analyticsData,
 *   { key: '1Y', days: 365, label: '1Y' },
 *   '0x5678...9ABC'
 * );
 *
 * if (bundleResult.success) {
 *   console.log('Exported:', bundleResult.filename);
 * } else {
 *   console.error('Export failed:', bundleResult.error);
 * }
 */
export async function exportAnalyticsToCSV(
  userId: string,
  data: AnalyticsData,
  timePeriod: AnalyticsTimePeriod,
  walletFilter?: WalletFilter
): Promise<ExportResult> {
  try {
    // Import validation utility dynamically to avoid circular dependencies
    const { validateExportData } =
      await import("@/lib/analytics/analyticsValidation");

    // Validate user ID
    if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
      return {
        success: false,
        error: "User ID is required for export",
      };
    }

    // Validate analytics data
    if (!validateExportData(data)) {
      return {
        success: false,
        error: "Invalid analytics data - missing required fields",
      };
    }

    // Build export metadata
    const metadata: ExportMetadata = {
      userId,
      timePeriod,
      data,
      timestamp: new Date(),
      ...(walletFilter !== undefined && { walletFilter }), // Include wallet filter only if defined
    };

    // Generate CSV content (includes wallet filter info in header)
    const csvContent = generateAnalyticsCSV(metadata);

    // Generate filename (includes wallet address if filtered)
    const filename = generateExportFilename(
      userId,
      metadata.timestamp,
      walletFilter
    );

    // Trigger browser download
    downloadCSV(csvContent, filename);

    return {
      success: true,
      filename,
    };
  } catch (error) {
    // Log error for debugging
    logger.error("Export failed", error, "analyticsExportService");

    return {
      success: false,
      error:
        error instanceof Error
          ? `Failed to generate CSV file: ${error.message}`
          : "Failed to generate CSV file",
    };
  }
}
