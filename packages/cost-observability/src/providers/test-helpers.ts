import { expect, vi, type Mock } from 'vitest';

import type { CostSnapshot } from '../types.js';
import { fetchBraveCostSnapshot } from './brave.js';
import {
  fetchCloudflareCostSnapshot,
  type CloudflareCostInput,
} from './cloudflare.js';

/**
 * Shared fixtures for the provider collector tests. The OpenRouter key
 * payload, the Brave quota stub response, and the default-collector
 * assertions are identical across `providers.test.ts` and
 * `coverage-completion.test.ts`; they live here so the duplication gate
 * sees one definition instead of copy-pasted setup blocks.
 */
export function braveTestResponse(
  headers: Record<string, string>,
  status = 200,
): Response {
  return new Response('{}', { status, headers });
}

export function createOpenRouterKeyFetcher(args: {
  usage: number;
  limit?: number | null;
  limitRemaining?: number | null;
}): Mock {
  const { usage, limit = 100, limitRemaining = null } = args;
  return vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        data: {
          usage,
          usage_daily: usage,
          usage_weekly: usage,
          usage_monthly: usage,
          limit,
          limit_remaining: limitRemaining,
        },
      }),
    ),
  );
}

export function expectFreshZeroCostSnapshot(snapshot: CostSnapshot): void {
  expect(snapshot.accruedCostUsd).toBe(0);
  expect(Number.isNaN(Date.parse(snapshot.fetchedAt))).toBe(false);
}

export function expectBraveSearchAuthCall(
  fetcher: unknown,
  urlSubstring: string,
  apiKey = 'brave-key',
): void {
  expect(fetcher).toHaveBeenCalledWith(
    expect.objectContaining({
      href: expect.stringContaining(urlSubstring),
    }),
    expect.objectContaining({
      headers: expect.objectContaining({
        'x-subscription-token': apiKey,
      }),
    }),
  );
}

/**
 * What a "uses the global fetch and endpoint defaults" case asserts: the
 * collector reached the vendor's own URL with its own auth header. The URL is
 * returned so a caller can go on to check the query it built.
 */
export function expectDefaultCollectorCall(
  fetcher: Mock,
  expected: { urlSubstring: string; headerName: string; headerValue: string },
): URL {
  const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
  expect(url.href).toContain(expected.urlSubstring);
  expect((init.headers as Record<string, string>)[expected.headerName]).toBe(
    expected.headerValue,
  );
  return url;
}

export function fetchBraveQuotaSnapshot(
  headers: Record<string, string>,
  now: Date,
): Promise<CostSnapshot> {
  return fetchBraveCostSnapshot({
    apiKey: 'key',
    unitCostUsd: 1,
    fetch: vi.fn().mockResolvedValue(braveTestResponse(headers)),
    now,
  });
}

/**
 * The constant half of a Cloudflare FOCUS charge row, carrying every field the
 * v1 `billable-usage` endpoint returns so a spec can null one out and see the
 * collector's answer.
 *
 * Shaped from a live capture of our own account (2026-09-24) with the account,
 * billing-account and subscription identifiers replaced by placeholders and the
 * quantities invented. The capture confirmed the cost precedence columns
 * (`EffectiveCost`, `ContractedCost`, `ListCost`) are all populated mid-period.
 */
const CLOUDFLARE_BASE_ROW = {
  BilledCost: 0.000257,
  BillingAccountId: 'billing-account-redacted',
  BillingAccountName: 'account-name-redacted',
  BillingCurrency: 'USD',
  BillingPeriodStart: '2026-09-01T00:00:00Z',
  ChargeCategory: 'Usage',
  ChargeClass: null,
  ChargeDescription:
    'R2 Data Storage (First 10GB-Month included) usage measured in GB-months',
  ChargePeriodEnd: '2026-09-02T00:00:00Z',
  ChargePeriodStart: '2026-09-01T00:00:00Z',
  ConsumedQuantity: 12.5,
  ConsumedUnit: 'GB-months',
  ContractedCost: 0.000257,
  CumulatedContractedCost: 0.000257,
  CumulatedPricingQuantity: 12.5,
  EffectiveCost: 0.000257,
  HostProviderName: 'Cloudflare, Inc.',
  InvoiceIssuerName: 'Cloudflare, Inc.',
  ListCost: 0.000257,
  PricingQuantity: 12.5,
  PricingUnit: 'GB-months',
  ServiceFamilyName: 'R2',
  ServiceName: 'R2 Data Storage (First 10GB-Month included)',
  ServiceProviderName: 'Cloudflare, Inc.',
  SubscriptionId: 'subscription-redacted',
};

export function cloudflareRow(
  overrides: Partial<Record<keyof typeof CLOUDFLARE_BASE_ROW, unknown>> = {},
): Record<string, unknown> {
  return { ...CLOUDFLARE_BASE_ROW, ...overrides };
}

export function cloudflareUsageResponse(
  rows: unknown[],
  options: { status?: number; success?: boolean; errors?: unknown[] } = {},
): Response {
  const { status = 200, success = true, errors = [] } = options;
  return new Response(
    JSON.stringify({
      success,
      errors,
      messages: [],
      // Cloudflare nulls the result rather than returning an empty array when
      // it rejects a request, so the fixture has to do the same.
      result: success ? rows : null,
    }),
    { status },
  );
}

const CLOUDFLARE_NOW = new Date('2026-09-04T00:00:00.000Z');

export function fetchCloudflareUsageSnapshot(
  rows: unknown[],
  input: Partial<CloudflareCostInput> = {},
): Promise<CostSnapshot> {
  return fetchCloudflareCostSnapshot({
    apiToken: 'cf-token',
    accountId: 'acct-1',
    fetch: vi.fn().mockResolvedValue(cloudflareUsageResponse(rows)),
    now: CLOUDFLARE_NOW,
    ...input,
  });
}

/**
 * Three charge periods across two R2 metrics: the smallest fixture that still
 * exercises per-metric grouping, multi-day accrual, sub-cent rounding and the
 * empty `ConsumedUnit` a count-priced metric reports, at once.
 */
const CLOUDFLARE_CLASS_A_OPERATIONS = {
  ChargeDescription:
    'R2 Storage Class A Operations (First 1M included) usage measured in Count',
  ConsumedUnit: '',
  PricingUnit: 'Count',
  ServiceName: 'R2 Storage Class A Operations (First 1M included)',
};

export const CLOUDFLARE_R2_ROWS = [
  cloudflareRow({}),
  cloudflareRow({
    ChargePeriodEnd: '2026-09-02T00:00:00Z',
    ChargePeriodStart: '2026-09-01T00:00:00Z',
    ...CLOUDFLARE_CLASS_A_OPERATIONS,
    ConsumedQuantity: 1_200,
    BilledCost: 0.0054,
    ContractedCost: 0.0054,
    EffectiveCost: 0.0054,
    ListCost: 0.0054,
    PricingQuantity: 1_200,
  }),
  cloudflareRow({
    ChargePeriodEnd: '2026-09-03T00:00:00Z',
    ChargePeriodStart: '2026-09-02T00:00:00Z',
    ConsumedQuantity: 13,
    BilledCost: 0.000267,
    ContractedCost: 0.000267,
    EffectiveCost: 0.000267,
    ListCost: 0.000267,
    PricingQuantity: 13,
  }),
  cloudflareRow({
    ChargePeriodEnd: '2026-09-03T00:00:00Z',
    ChargePeriodStart: '2026-09-02T00:00:00Z',
    ...CLOUDFLARE_CLASS_A_OPERATIONS,
    ConsumedQuantity: 900,
    BilledCost: 0.00405,
    ContractedCost: 0.00405,
    EffectiveCost: 0.00405,
    ListCost: 0.00405,
    PricingQuantity: 900,
  }),
  cloudflareRow({
    ChargePeriodEnd: '2026-09-04T00:00:00Z',
    ChargePeriodStart: '2026-09-03T00:00:00Z',
    ConsumedQuantity: 13.5,
    BilledCost: 0.000277,
    ContractedCost: 0.000277,
    EffectiveCost: 0.000277,
    ListCost: 0.000277,
    PricingQuantity: 13.5,
  }),
  cloudflareRow({
    ChargePeriodEnd: '2026-09-04T00:00:00Z',
    ChargePeriodStart: '2026-09-03T00:00:00Z',
    ...CLOUDFLARE_CLASS_A_OPERATIONS,
    ConsumedQuantity: 1_500,
    BilledCost: 0.00675,
    ContractedCost: 0.00675,
    EffectiveCost: 0.00675,
    ListCost: 0.00675,
    PricingQuantity: 1_500,
  }),
];
