import { z } from 'zod';

import { currentUtcPeriod, projectMonthEnd } from '../time.js';
import type { CostSnapshot, CostUsageItem, FetchLike } from '../types.js';
import { fetchWithRetry, type Sleep } from './http.js';
import { roundUsageUsd } from './numbers.js';

const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';
const REQUEST_LABEL = 'Cloudflare billable usage';

export interface CloudflareCostInput {
  apiToken: string;
  accountId: string;
  fetch?: FetchLike;
  now?: Date;
  baseUrl?: string;
  priorMonthTotalUsd?: number | null;
  sleep?: Sleep;
}

/**
 * One FOCUS-shaped charge row. Only the fields this collector reads are
 * declared; the payload carries about twenty more and `looseObject` keeps them
 * rather than failing on a field Cloudflare adds later.
 *
 * `ServiceName` is the billable metric: the v1 payload has no separate metric
 * id. `ConsumedUnit` is an empty string on count-priced metrics, so the label
 * falls back to `PricingUnit`.
 *
 * `ConsumedQuantity` is deliberately not `.nonnegative()`: a `ChargeClass`
 * of `Correction` reverses an earlier charge, and dropping those rows would
 * bill us for usage Cloudflare already took back.
 */
const billableRowSchema = z.looseObject({
  BillingCurrency: z.string().nullish(),
  ConsumedQuantity: z.number(),
  ConsumedUnit: z.string().nullish(),
  ContractedCost: z.number().nullish(),
  EffectiveCost: z.number().nullish(),
  ListCost: z.number().nullish(),
  PricingUnit: z.string().nullish(),
  ServiceFamilyName: z.string().nullish(),
  ServiceName: z.string().min(1),
});

type BillableRow = z.infer<typeof billableRowSchema>;

const envelopeSchema = z.looseObject({
  success: z.boolean(),
  errors: z.array(z.looseObject({ code: z.number() })),
  result: z.unknown(),
});

/**
 * The whole Cloudflare account's month-to-date bill, read from the Billing
 * API's v1 billable-usage endpoint. The v2 `billable/usage` endpoint is a
 * restricted alpha: it answers 403 (code 1171) to a token that already holds
 * Billing Read, so it cannot be used until Cloudflare enables it per account.
 *
 * R2 is the only Cloudflare product we knowingly pay for, but the accrued
 * figure is the account total on purpose: a ledger that silently excluded a
 * product someone enabled later would understate the bill for months. Every
 * billable metric the account reports lands in `usage` instead, so what drove
 * the number stays visible without a second endpoint.
 *
 * The dollar figure is always Cloudflare's own. R2's published rates cannot be
 * re-derived from bytes — storage is billed on a daily-peak GB-month average,
 * free tiers come off first, and units round up — so anything computed here
 * would be a plausible-looking number that is not the bill.
 */
export async function fetchCloudflareCostSnapshot(
  input: CloudflareCostInput,
): Promise<CostSnapshot> {
  const now = input.now ?? new Date();
  const { periodStart, periodEnd } = currentUtcPeriod(now);
  const response = await fetchWithRetry({
    url: buildEndpoint(input, periodStart, periodEnd),
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${input.apiToken}`,
    },
    label: REQUEST_LABEL,
    fetch: input.fetch,
    sleep: input.sleep,
  });
  const rows = readBillableRows(await response.json());
  assertUsdOnly(rows);
  const accruedCostUsd = sumRowCosts(rows, effectiveRowCost);

  return {
    provider: 'cloudflare',
    periodStart,
    periodEnd,
    usage: buildUsageItems(rows),
    accruedCostUsd,
    projectedCostUsd:
      accruedCostUsd === null
        ? null
        : projectMonthEnd(accruedCostUsd, now, input.priorMonthTotalUsd),
    costType: 'actual',
    source: 'api',
    fetchedAt: now.toISOString(),
  };
}

function buildEndpoint(
  input: CloudflareCostInput,
  periodStart: string,
  periodEnd: string,
): URL {
  const baseUrl = input.baseUrl ?? CLOUDFLARE_API_BASE_URL;
  return new URL(
    `${baseUrl}/accounts/${encodeURIComponent(input.accountId)}/billable-usage?from=${utcDate(periodStart)}&to=${utcDate(periodEnd)}`,
  );
}

/** The endpoint filters on charge-period dates, not timestamps. */
function utcDate(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Cloudflare answers `200` with `success: false` for a rejected request, so
 * the status check in `fetchWithRetry` is not the whole story. Rows are parsed
 * only once `success` is true: parsing a `null` result first would report an
 * anonymous schema error instead of the account-level code that explains it.
 */
function readBillableRows(payload: unknown): BillableRow[] {
  const envelope = envelopeSchema.parse(payload);
  if (!envelope.success) {
    const code = envelope.errors[0]?.code;
    throw new Error(
      code === undefined
        ? `${REQUEST_LABEL} request was rejected (no error code)`
        : `${REQUEST_LABEL} request was rejected (error code ${code})`,
    );
  }
  return z.array(billableRowSchema).parse(envelope.result);
}

/**
 * The ledger's every column is USD. A billing profile switched to another
 * currency is a real change we can fix in code, so it goes red rather than
 * summing foreign money into a dollar total.
 */
function assertUsdOnly(rows: BillableRow[]): void {
  const foreign = rows.find((row) => (row.BillingCurrency ?? 'USD') !== 'USD');
  if (foreign) {
    throw new Error(
      `${REQUEST_LABEL} reported a non-USD currency (${foreign.BillingCurrency})`,
    );
  }
}

/**
 * What the row actually costs us, in the order Cloudflare's own precedence
 * runs: a negotiated effective price wins over the contracted one, which wins
 * over list. `BilledCost` is deliberately absent: FOCUS defines it as the
 * invoiced amount, which settles at invoice time rather than as usage accrues.
 */
function effectiveRowCost(row: BillableRow): number | null {
  return row.EffectiveCost ?? row.ContractedCost ?? row.ListCost ?? null;
}

/**
 * A single unpriceable row makes the whole total unknown rather than a smaller
 * number that looks complete. Zero rows are different: the vendor answered that
 * nothing was billable, which really is $0.
 *
 * Six decimals, not two: an R2 month starts in fractions of a cent, and
 * rounding to cents would publish a fabricated $0.00 for spend that exists.
 */
function sumRowCosts(
  rows: BillableRow[],
  pick: (row: BillableRow) => number | null | undefined,
): number | null {
  let total = 0;
  for (const row of rows) {
    const value = pick(row);
    if (value === null || value === undefined) {
      return null;
    }
    total += value;
  }
  return roundUsageUsd(total);
}

function buildUsageItems(rows: BillableRow[]): CostUsageItem[] {
  const listCostUsd = sumRowCosts(rows, (row) => row.ListCost);
  const productFamilies = new Set(
    rows
      .map((row) => row.ServiceFamilyName)
      .filter((name): name is string => typeof name === 'string'),
  );
  return [
    {
      key: 'charge_rows',
      label: 'Billed charge rows',
      unit: 'units',
      value: rows.length,
    },
    ...(listCostUsd === null
      ? []
      : [
          {
            key: 'list_cost_usd',
            label: 'List price before discounts',
            unit: 'usd' as const,
            value: listCostUsd,
          },
        ]),
    ...(productFamilies.size === 0
      ? []
      : [
          {
            key: 'product_families',
            label: 'Billed product families',
            unit: 'units' as const,
            value: productFamilies.size,
          },
        ]),
    ...metricUsageItems(rows),
  ];
}

/**
 * One item per billable metric, which is where "the bill went up" becomes
 * "Class A operations tripled".
 *
 * Grouping keys on the exact service name, and two names that slug the same
 * get a numeric suffix rather than being collapsed: merging two metrics into
 * one item would hide the quantity that moved.
 */
function metricUsageItems(rows: BillableRow[]): CostUsageItem[] {
  const byMetric = new Map<string, BillableRow[]>();
  for (const row of rows) {
    const group = byMetric.get(row.ServiceName) ?? [];
    group.push(row);
    byMetric.set(row.ServiceName, group);
  }

  const takenKeys = new Set<string>();
  const items: CostUsageItem[] = [];
  for (const serviceName of [...byMetric.keys()].sort()) {
    const group = byMetric.get(serviceName)!;
    const sample = group[0]!;
    const preferredKey = `metric_${slugifyMetricName(serviceName)}`;
    let key = preferredKey;
    for (let suffix = 2; takenKeys.has(key); suffix += 1) {
      key = `${preferredKey}_${suffix}`;
    }
    takenKeys.add(key);
    const unit = sample.ConsumedUnit || sample.PricingUnit;
    items.push({
      key,
      label: unit ? `${serviceName} (${unit})` : serviceName,
      unit: 'units',
      value: roundUsageUsd(
        group.reduce((sum, row) => sum + row.ConsumedQuantity, 0),
      ),
    });
  }
  return items.sort((left, right) => left.key.localeCompare(right.key));
}

function slugifyMetricName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '');
}
