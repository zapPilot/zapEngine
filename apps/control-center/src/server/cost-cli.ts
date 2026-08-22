import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import {
  COST_PROVIDERS,
  type CostProvider,
} from '@zapengine/cost-observability';

import type { CostTransactionKind } from '../shared/types.js';
import { readControlCenterConfig } from './config/env.js';
import { createCostRepository } from './services/cost-repository.js';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
);
dotenv.config({ path: resolve(repoRoot, '.env') });

const repository = createCostRepository(readControlCenterConfig());
if (!repository) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const [command, providerArg, kindOrAmount, amountArg, ...descriptionParts] =
  process.argv.slice(2);
const provider = parseProvider(providerArg);

if (command === 'snapshot') {
  const amountUsd = parseAmount(kindOrAmount);
  await repository.upsertManualSnapshot({
    provider,
    amountUsd,
    now: new Date(),
  });
  process.stdout.write(
    `Saved ${provider} manual snapshot: $${amountUsd.toFixed(2)}\n`,
  );
} else if (command === 'transaction') {
  const kind = parseKind(kindOrAmount);
  const amountUsd = parseAmount(amountArg);
  await repository.insertTransaction({
    provider,
    amountUsd,
    chargedAt: new Date().toISOString(),
    kind,
    source: 'manual-cli',
    description: descriptionParts.join(' ') || null,
  });
  process.stdout.write(
    `Saved ${provider} ${kind} transaction: $${amountUsd.toFixed(2)}\n`,
  );
} else {
  throw new Error(
    'Usage: ops:cost snapshot <provider> <usd> | ops:cost transaction <provider> <kind> <usd> [description]',
  );
}

function parseProvider(value: string | undefined): CostProvider {
  if (value && COST_PROVIDERS.includes(value as CostProvider)) {
    return value as CostProvider;
  }
  throw new Error(`Unknown provider: ${value ?? '(missing)'}`);
}

function parseKind(value: string | undefined): CostTransactionKind {
  if (
    value === 'subscription' ||
    value === 'top_up' ||
    value === 'invoice' ||
    value === 'adjustment'
  ) {
    return value;
  }
  throw new Error(`Unknown transaction kind: ${value ?? '(missing)'}`);
}

function parseAmount(value: string | undefined): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Invalid USD amount: ${value ?? '(missing)'}`);
  }
  return amount;
}
