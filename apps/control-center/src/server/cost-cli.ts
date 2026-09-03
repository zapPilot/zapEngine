import {
  COST_PROVIDERS,
  type CostProvider,
} from '@zapengine/cost-observability';

import type { CostTransactionKind } from '../shared/types.js';
import { readControlCenterConfig } from './config/env.js';
import { createCostRepository } from './services/cost-repository.js';

const USAGE = [
  'Usage:',
  '  pnpm ops:cost snapshot <provider> <usd>',
  '      Record the billed month-to-date total read off the provider dashboard.',
  '      Fly publishes no billing or usage API, so for Fly this figure is the only',
  '      trustworthy source of month-end spend: without it Fly is excluded from the',
  '      headline totals, and the flyctl collector only ever reports a run-rate estimate.',
  '  pnpm ops:cost transaction <provider> <kind> <usd> [description]',
  '      Record one charge that actually happened (invoice, top_up, subscription,',
  '      adjustment) — cash out the door, not a month-to-date position.',
  `  <provider> is one of: ${COST_PROVIDERS.join(', ')}`,
].join('\n');

const [command, providerArg, kindOrAmount, amountArg, ...descriptionParts] =
  process.argv.slice(2);

// The command is dispatched before anything else is read, because the
// invocation with the most to learn from the usage text is the one that named
// no provider and opened no connection: `pnpm ops:cost` on its own. Parsing
// arguments or reaching for Supabase first buries that text behind an error
// about whatever the operator happened to omit.
if (command !== 'snapshot' && command !== 'transaction') {
  throw new Error(USAGE);
}

const provider = parseProvider(providerArg);
const repository = createCostRepository(readControlCenterConfig());
if (!repository) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

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
} else {
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
}

function parseProvider(value: string | undefined): CostProvider {
  if (value && COST_PROVIDERS.includes(value as CostProvider)) {
    return value as CostProvider;
  }
  throw new Error(`Unknown provider: ${value ?? '(missing)'}\n\n${USAGE}`);
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
  throw new Error(
    `Unknown transaction kind: ${value ?? '(missing)'}\n\n${USAGE}`,
  );
}

function parseAmount(value: string | undefined): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Invalid USD amount: ${value ?? '(missing)'}\n\n${USAGE}`);
  }
  return amount;
}
