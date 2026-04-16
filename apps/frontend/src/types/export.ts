/**
 * Export Types
 *
 * Type definitions for analytics export functionality
 */

import type {
  AnalyticsData,
  AnalyticsTimePeriod,
  WalletFilter,
} from "./analytics";

/**
 * Metadata for export operations
 */
export interface ExportMetadata {
  /** User ID (wallet address) */
  userId: string;
  /** Selected time period for the analytics data */
  timePeriod: AnalyticsTimePeriod;
  /** Complete analytics data to export */
  data: AnalyticsData;
  /** Timestamp when the export was generated */
  timestamp: Date;
  /** Optional wallet filter (null = all wallets, string = specific wallet) */
  walletFilter?: WalletFilter;
}

/**
 * CSV generation options
 */
export interface CsvGenerationOptions {
  /** Include UTF-8 BOM for Excel compatibility (default: true) */
  includeBOM?: boolean;
  /** Line ending style (default: CRLF for Windows/Excel) */
  lineEnding?: "\r\n" | "\n";
  /** CSV field delimiter (default: comma) */
  delimiter?: string;
  /** Quote character for escaping (default: double quote) */
  quote?: string;
}

/**
 * Result of an export operation
 */
export interface ExportResult {
  /** Whether the export was successful */
  success: boolean;
  /** Generated filename (if successful) */
  filename?: string;
  /** Error message (if failed) */
  error?: string;
}
