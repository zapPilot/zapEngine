import type { AppEnv } from './env';

function getByPath(source: Record<string, unknown>, key: string): unknown {
  const segments = key.split('.');
  let current: unknown = source;

  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

export class ConfigService {
  constructor(private readonly env: AppEnv) {}

  get<T>(key: string, defaultValue?: T): T | undefined {
    const source = this.env as unknown as Record<string, unknown>;
    const nestedValue = getByPath(source, key);
    if (nestedValue !== undefined) {
      return nestedValue as T;
    }

    const directValue = source[key];
    if (directValue !== undefined) {
      return directValue as T;
    }

    return defaultValue;
  }
}
