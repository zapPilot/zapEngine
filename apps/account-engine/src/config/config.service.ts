import type { AppEnv } from './env';

export class ConfigService {
  constructor(private readonly env: AppEnv) {}

  get<T>(key: string, defaultValue?: T): T | undefined {
    const source = this.env as unknown as Record<string, unknown>;
    const directValue = source[key];
    if (directValue !== undefined) {
      return directValue as T;
    }

    return defaultValue;
  }
}
