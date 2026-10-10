import { fundReviewExpiry } from '@/integration/fundFlowModel';
import { expect, it } from 'vitest';
import {
  deriveFundStep,
  deriveFundSignRequest,
  type FundProgressPhase,
} from '@/integration/fundFlowModel';
const draft = {
  visible: false,
  hasFrozenDraft: true,
  amountUsd: 100,
  phase: null,
  expiresAt: 1000,
  needsAgent: false,
};
it('keeps execution ahead of editable draft state', () => {
  expect(deriveFundStep({ hasFrozenDraft: false, hasProgress: false })).toBe(
    'amount',
  );
  expect(deriveFundStep({ hasFrozenDraft: true, hasProgress: false })).toBe(
    'review',
  );
  expect(deriveFundStep({ hasFrozenDraft: false, hasProgress: true })).toBe(
    'progress',
  );
});
it('offers checked drafts, checkpoints, and agent authorization only while the sheet is closed', () => {
  expect(deriveFundSignRequest(draft)).toEqual({
    kind: 'review',
    amountUsd: 100,
    expiresAt: 1000,
  });
  expect(deriveFundSignRequest({ ...draft, phase: 'checkpoint' })).toEqual({
    kind: 'checkpoint',
    amountUsd: 100,
    expiresAt: 1000,
  });
  expect(
    deriveFundSignRequest({ ...draft, phase: 'complete', needsAgent: true }),
  ).toEqual({ kind: 'agent', amountUsd: 100, expiresAt: 1000 });
  expect(deriveFundSignRequest({ ...draft, visible: true })).toBeNull();
  for (const phase of [
    'confirming',
    'submitted',
    'failed',
    'complete',
  ] as FundProgressPhase[])
    expect(deriveFundSignRequest({ ...draft, phase })).toBeNull();
  expect(deriveFundSignRequest({ ...draft, hasFrozenDraft: false })).toBeNull();
  for (const amountUsd of [0, -1, NaN, Infinity])
    expect(deriveFundSignRequest({ ...draft, amountUsd })).toBeNull();
});

const checkedReview = {
  expiresAt: 123,
  blocked: false,
  executionAllowed: true,
  status: 'passed',
};
it('only marks the complete executable review as checked', () => {
  expect(fundReviewExpiry([], 0)).toBeNull();
  expect(fundReviewExpiry([checkedReview], 2)).toBeNull();
  expect(
    fundReviewExpiry([checkedReview, { ...checkedReview, expiresAt: 100 }], 2),
  ).toBe(100);
  for (const partial of [
    { blocked: true },
    { executionAllowed: false },
    { status: 'failed' },
    { status: 'unavailable' },
    { expiresAt: NaN },
  ])
    expect(fundReviewExpiry([{ ...checkedReview, ...partial }], 1)).toBeNull();
});
