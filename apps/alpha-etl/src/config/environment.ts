import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';
import { z } from 'zod';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT_ENV = path.resolve(configDir, '../../../../.env');
config({ path: REPO_ROOT_ENV, quiet: true });

function parseBoolean(value: string): boolean {
  return value.toLowerCase() === 'true';
}

function parsePort(defaultValue: string) {
  return z
    .string()
    .default(defaultValue)
    .transform(Number)
    .pipe(z.number().int().min(1).max(65535));
}

function parseOptionalPort() {
  return z.coerce.number().int().min(1).max(65535).optional();
}

function parsePositiveInteger(defaultValue: string) {
  return z
    .string()
    .default(defaultValue)
    .transform(Number)
    .pipe(z.number().int().positive());
}

function parseOptionalNonEmptyString() {
  return z.preprocess((value) => {
    if (typeof value === 'string' && value.trim() === '') {
      return;
    }
    return value;
  }, z.string().min(1).optional());
}

function parseBooleanFlag(defaultValue: 'true' | 'false') {
  return z
    .string()
    .default(defaultValue)
    .transform(parseBoolean)
    .pipe(z.boolean());
}

const envSchema = z.object({
  // Database
  ALPHA_ETL_DATABASE_URL: z.string().min(1),
  DB_SCHEMA: z.string().min(1).default('alpha_raw'),

  // Server
  ALPHA_ETL_PORT: parseOptionalPort(),
  PORT: parsePort('3003'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  // Webhook
  WEBHOOK_SECRET: parseOptionalNonEmptyString(),

  // API Endpoints
  DEFILLAMA_API_URL: z.string().url().default('https://api.llama.fi'),
  HYPERLIQUID_API_URL: z
    .string()
    .url()
    .default('https://api-ui.hyperliquid.xyz'),
  HYPERLIQUID_RATE_LIMIT_RPM: parsePositiveInteger('60'),

  // CoinMarketCap API
  COINMARKETCAP_API_KEY: z.string().min(1).optional(),
  COINMARKETCAP_API_URL: z
    .string()
    .url()
    .default('https://pro-api.coinmarketcap.com'),

  // Alpha Vantage API (for stock price data)
  ALPHA_VANTAGE_API_KEY: z.string().min(1).optional(),

  // Rate Limiting
  RATE_LIMIT_REQUESTS_PER_MINUTE: parsePositiveInteger('60'),
  RATE_LIMIT_BURST: parsePositiveInteger('10'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Materialized View Refresh
  ENABLE_MV_REFRESH: parseBooleanFlag('true'),
});

type Environment = z.infer<typeof envSchema>;

function parseEnvironment(): Environment {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    throw new Error(
      `Environment validation failed:\n${JSON.stringify(result.error.format(), null, 2)}`,
    );
  }

  return {
    ...result.data,
    PORT: result.data.ALPHA_ETL_PORT ?? result.data.PORT,
  };
}

export const env = parseEnvironment();

export type { Environment };
