/**
 * Centralized logging utility with levels and formatting
 */

import { getRuntimeEnv, isRuntimeMode } from '@/lib/env/runtimeEnv';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogConfig {
  level: LogLevel;
  enableConsole: boolean;
  maxLocalLogs: number;
  enableDebugInProduction?: boolean;
  enableDevLogging?: boolean;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: unknown;
  context?: string;
  error?: Error;
}

export class Logger {
  private config: LogConfig;
  private localLogs: LogEntry[] = [];

  constructor(config: Partial<LogConfig> = {}) {
    const isProduction = isRuntimeMode('production');
    const isDevelopment = isRuntimeMode('development');
    const enableDebugInProd =
      getRuntimeEnv('VITE_ENABLE_DEBUG_LOGGING') === 'true';
    const enableDevLogging =
      getRuntimeEnv('VITE_ENABLE_DEV_LOGGING') !== 'false';

    this.config = {
      level:
        isProduction && !enableDebugInProd ? LogLevel.WARN : LogLevel.DEBUG,
      enableConsole: isDevelopment || enableDebugInProd,
      enableDebugInProduction: enableDebugInProd,
      enableDevLogging,
      maxLocalLogs: 1000,
      ...config,
    };
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.level;
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    data?: unknown,
    context?: string,
    error?: Error,
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    };

    if (context !== undefined) {
      entry.context = context;
    }

    if (error !== undefined) {
      entry.error = error;
    }

    return entry;
  }

  private formatLogEntry(entry: LogEntry): string {
    const levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    const levelName = levelNames[entry.level] || 'UNKNOWN';
    const contextStr = entry.context ? `[${entry.context}] ` : '';
    const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
    const errorStr = entry.error ? ` Error: ${entry.error.message}` : '';

    return `${entry.timestamp} ${levelName} ${contextStr}${entry.message}${dataStr}${errorStr}`;
  }

  private log(
    level: LogLevel,
    message: string,
    data?: unknown,
    context?: string,
    error?: Error,
  ): void {
    if (!this.shouldLog(level)) return;

    const entry = this.createLogEntry(level, message, data, context, error);

    // Store locally
    this.localLogs.push(entry);
    if (this.localLogs.length > this.config.maxLocalLogs) {
      this.localLogs.shift();
    }

    // Console output
    if (this.config.enableConsole) {
      const formattedMessage = this.formatLogEntry(entry);

      switch (level) {
        case LogLevel.DEBUG:
          console.debug(formattedMessage);
          break;
        case LogLevel.INFO:
          console.info(formattedMessage);
          break;
        case LogLevel.WARN:
          console.warn(formattedMessage);
          break;
        case LogLevel.ERROR:
          console.error(formattedMessage);
          break;
      }
    }
  }

  debug(message: string, data?: unknown, context?: string): void {
    this.log(LogLevel.DEBUG, message, data, context);
  }

  info(message: string, data?: unknown, context?: string): void {
    this.log(LogLevel.INFO, message, data, context);
  }

  warn(message: string, data?: unknown, context?: string): void {
    this.log(LogLevel.WARN, message, data, context);
  }

  error(message: string, error?: Error | unknown, context?: string): void {
    const errorObj = error instanceof Error ? error : undefined;
    const data = error instanceof Error ? undefined : error;
    this.log(LogLevel.ERROR, message, data, context, errorObj);
  }

  // Utility methods
  getLogs(): LogEntry[] {
    return [...this.localLogs];
  }

  clearLogs(): void {
    this.localLogs = [];
  }

  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Enable/disable console logging at runtime
   */
  setConsoleLogging(enabled: boolean): void {
    this.config.enableConsole = enabled;
  }

  /**
   * Get current configuration
   */
  getConfig(): LogConfig {
    return { ...this.config };
  }

  getLevel(): LogLevel {
    return this.config.level;
  }

  // Context-aware logging
  createContextLogger(context: string): ContextLogger {
    return new ContextLogger(this, context);
  }
}

class ContextLogger {
  constructor(
    private logger: Logger,
    private context: string,
  ) {}

  debug(message: string, data?: unknown): void {
    this.logger.debug(message, data, this.context);
  }

  info(message: string, data?: unknown): void {
    this.logger.info(message, data, this.context);
  }

  warn(message: string, data?: unknown): void {
    this.logger.warn(message, data, this.context);
  }

  error(message: string, error?: Error | unknown): void {
    this.logger.error(message, error, this.context);
  }
}

// Export singleton instance
export const logger = new Logger();

// Convenience factory for ad-hoc context loggers
// Export context-aware loggers for common areas
export const walletLogger = logger.createContextLogger('Wallet');

// Export types and classes
export type { LogEntry };
