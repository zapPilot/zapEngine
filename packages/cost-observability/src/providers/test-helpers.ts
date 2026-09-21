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
 * The constant half of a Cloudflare FOCUS charge row. Every field Cloudflare
 * documents is present so a spec can null one out and see the collector's
 * answer, rather than discovering that the field was never in the fixture.
 *
 * NOT captured from our own account: this is shaped from Cloudflare's
 * documented Billing API V2 response, with account-identifying fields written
 * as obvious placeholders. The per-row cost precedence it pins
 * (`EffectiveCost` -> `ContractedCost` -> `ListCost`) is still unconfirmed
 * against a live payload — see `AGENTS.md`.
 */
const CLOUDFLARE_BASE_ROW = {
  BilledCost: null,
  BillingAccountId: 'billing-account-redacted',
  BillingAccountName: 'account-name-redacted',
  BillingCurrency: 'USD',
  BillingPeriodEnd: '2026-10-01T00:00:00Z',
  BillingPeriodStart: '2026-09-01T00:00:00Z',
  ChargeCategory: 'Usage',
  ChargeClass: null,
  ChargeDescription: 'Cloudflare R2 Standard storage',
  ChargeFrequency: 'Usage-Based',
  ChargePeriodEnd: '2026-09-02T00:00:00Z',
  ChargePeriodStart: '2026-09-01T00:00:00Z',
  ConsumedQuantity: 12.5,
  ConsumedUnit: 'GB-hours',
  ContractedCost: null,
  ContractedUnitPrice: null,
  EffectiveCost: 0.000257,
  HostProviderName: 'Cloudflare',
  InvoiceIssuerName: 'Cloudflare',
  ListCost: 0.000257,
  ListUnitPrice: 0.0000205,
  PricingQuantity: 12.5,
  PricingUnit: 'GB-hours',
  RegionId: null,
  RegionName: null,
  ServiceProviderName: 'Cloudflare',
  SubAccountId: null,
  SubAccountName: null,
  x_BillableMetricId: 'r2_storage_gb_hours',
  x_BillableMetricName: 'R2 Standard Storage',
  x_ProductCategoryName: 'Storage',
  x_ProductFamilyId: 'r2',
  x_ProductFamilyName: 'R2',
  x_ZoneId: null,
  x_ZoneName: null,
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
 * exercises per-metric grouping, multi-day accrual and sub-cent rounding at
 * once.
 */
export const CLOUDFLARE_R2_ROWS = [
  cloudflareRow({}),
  cloudflareRow({
    ChargePeriodEnd: '2026-09-02T00:00:00Z',
    ChargePeriodStart: '2026-09-01T00:00:00Z',
    ChargeDescription: 'Cloudflare R2 Class A operations',
    ConsumedQuantity: 1_200,
    ConsumedUnit: 'operations',
    EffectiveCost: 0.0054,
    ListCost: 0.0054,
    ListUnitPrice: 0.0000045,
    PricingQuantity: 1_200,
    PricingUnit: 'operations',
    x_BillableMetricId: 'r2_class_a_operations',
    x_BillableMetricName: 'R2 Class A Operations',
  }),
  cloudflareRow({
    ChargePeriodEnd: '2026-09-03T00:00:00Z',
    ChargePeriodStart: '2026-09-02T00:00:00Z',
    ConsumedQuantity: 13,
    EffectiveCost: 0.000267,
    ListCost: 0.000267,
    PricingQuantity: 13,
  }),
  cloudflareRow({
    ChargePeriodEnd: '2026-09-03T00:00:00Z',
    ChargePeriodStart: '2026-09-02T00:00:00Z',
    ChargeDescription: 'Cloudflare R2 Class A operations',
    ConsumedQuantity: 900,
    ConsumedUnit: 'operations',
    EffectiveCost: 0.00405,
    ListCost: 0.00405,
    ListUnitPrice: 0.0000045,
    PricingQuantity: 900,
    PricingUnit: 'operations',
    x_BillableMetricId: 'r2_class_a_operations',
    x_BillableMetricName: 'R2 Class A Operations',
  }),
  cloudflareRow({
    ChargePeriodEnd: '2026-09-04T00:00:00Z',
    ChargePeriodStart: '2026-09-03T00:00:00Z',
    ConsumedQuantity: 13.5,
    EffectiveCost: 0.000277,
    ListCost: 0.000277,
    PricingQuantity: 13.5,
  }),
  cloudflareRow({
    ChargePeriodEnd: '2026-09-04T00:00:00Z',
    ChargePeriodStart: '2026-09-03T00:00:00Z',
    ChargeDescription: 'Cloudflare R2 Class A operations',
    ConsumedQuantity: 1_500,
    ConsumedUnit: 'operations',
    EffectiveCost: 0.00675,
    ListCost: 0.00675,
    ListUnitPrice: 0.0000045,
    PricingQuantity: 1_500,
    PricingUnit: 'operations',
    x_BillableMetricId: 'r2_class_a_operations',
    x_BillableMetricName: 'R2 Class A Operations',
  }),
];
