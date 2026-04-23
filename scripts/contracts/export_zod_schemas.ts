import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import {
  AssetAllocationSchema,
  BacktestRequestSchema,
  BacktestResponseSchema,
  BacktestStrategyCatalogResponseV3Schema,
  BucketTransferSchema,
  DailySuggestionResponseSchema,
  PortfolioAllocationSchema,
  StrategyConfigsResponseSchema,
  StrategyPresetSchema,
} from '../../packages/types/src/strategy/index.js';

const SNAPSHOT_SCHEMAS = {
  asset_allocation: AssetAllocationSchema,
  backtest_request: BacktestRequestSchema,
  backtest_response: BacktestResponseSchema,
  backtest_strategy_catalog_response: BacktestStrategyCatalogResponseV3Schema,
  bucket_transfer: BucketTransferSchema,
  daily_suggestion_response: DailySuggestionResponseSchema,
  portfolio_allocation: PortfolioAllocationSchema,
  strategy_configs_response: StrategyConfigsResponseSchema,
  strategy_preset: StrategyPresetSchema,
} as const satisfies Record<string, z.ZodType>;

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = path.join(SCRIPT_DIR, 'snapshots');

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortJson(entry)]),
    );
  }

  return value;
}

async function main(): Promise<void> {
  await mkdir(SNAPSHOT_DIR, { recursive: true });

  await Promise.all(
    Object.entries(SNAPSHOT_SCHEMAS).map(async ([name, schema]) => {
      const jsonSchema = z.toJSONSchema(schema);
      const snapshotPath = path.join(SNAPSHOT_DIR, `${name}.json`);
      await writeFile(
        snapshotPath,
        `${JSON.stringify(sortJson(jsonSchema), null, 2)}\n`,
        'utf8',
      );
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
