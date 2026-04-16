/* eslint-disable no-console */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

function formatScope(scope: string): string {
  return scope.length > 0 ? `[${scope}]` : '';
}

export class Logger {
  constructor(private readonly scope: string) {}

  debug(message: string, ...meta: unknown[]): void {
    this.write('DEBUG', message, ...meta);
  }

  log(message: string, ...meta: unknown[]): void {
    this.write('INFO', message, ...meta);
  }

  warn(message: string, ...meta: unknown[]): void {
    this.write('WARN', message, ...meta);
  }

  error(message: string, ...meta: unknown[]): void {
    this.write('ERROR', message, ...meta);
  }

  private write(level: LogLevel, message: string, ...meta: unknown[]): void {
    const timestamp = new Date().toISOString();
    const payload =
      meta.length > 0
        ? ` ${meta.map((entry) => this.serializeEntry(entry)).join(' ')}`
        : '';

    const line = `${timestamp} ${level} ${formatScope(this.scope)} ${message}${payload}`;

    if (level === 'ERROR') {
      console.error(line);
      return;
    }

    if (level === 'WARN') {
      console.warn(line);
      return;
    }

    console.info(line);
  }

  private serializeEntry(entry: unknown): string {
    if (typeof entry === 'string') {
      return entry;
    }

    if (entry instanceof Error) {
      return entry.stack ?? entry.message;
    }

    return JSON.stringify(entry);
  }
}
