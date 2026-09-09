// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  OperationsResponse,
  SocialGrowthResponse,
} from '../../shared/types.js';
import { getJson } from '../api.js';
import { GrowthJourneyPanel } from './GrowthJourneyPanel.js';

vi.mock('../api.js', () => ({ getJson: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const OPERATIONS = {
  generatedAt: '2026-09-09T06:00:00.000Z',
  status: 'healthy',
  domains: [],
  priorities: [],
  signals: [
    {
      fingerprint: 'posthog:audience/project',
      source: 'posthog',
      domain: 'analytics',
      status: 'healthy',
      title: 'PostHog audience',
      detail: null,
      evidence: {
        landingVisitors30d: 300,
        ctaUsers30d: 12,
        appVisitors30d: 55,
        walletConnectedUsers30d: 21,
        landingThreads30d: 210,
        landingX30d: 40,
        landingYoutube30d: 15,
        landingRednote30d: 5,
        landingDirect30d: 20,
        landingOther30d: 10,
      },
      observedAt: '2026-09-09T06:00:00.000Z',
      url: 'https://us.posthog.com/project/4242',
    },
  ],
} satisfies OperationsResponse;

const GROWTH = {
  status: 'ok',
  message: null,
  generatedAt: '2026-09-09T06:00:00.000Z',
  platforms: [],
  experiments: [],
  attribution: [],
  waitlist: {
    status: 'ok',
    message: null,
    total: 8,
    signups7d: 3,
    signups30d: 8,
    attributedSocial7d: 2,
    directOrUnknown7d: 1,
    conversions: [],
  },
} satisfies SocialGrowthResponse;

describe('GrowthJourneyPanel', () => {
  it('keeps person flow and durable waitlist counts visibly separate', async () => {
    vi.mocked(getJson).mockResolvedValue(OPERATIONS);

    render(<GrowthJourneyPanel growth={GROWTH} />);

    await waitFor(() =>
      expect(screen.getByText('300')).toBeVisible(),
    );
    expect(screen.getByText('210')).toBeVisible();
    expect(screen.getByText('12')).toBeVisible();
    expect(screen.getByText('8')).toBeVisible();
    expect(screen.getByText('55')).toBeVisible();
    expect(screen.getByText('21')).toBeVisible();
    expect(screen.getByText('Supabase durable rows')).toBeVisible();
    expect(screen.getByText('PostHog · not identity-linked')).toBeVisible();
    expect(screen.getByText(/different source.*aggregate counts/i)).toBeVisible();
    expect(screen.getByText(/96% leave before waitlist CTA/i)).toBeVisible();
    expect(getJson).toHaveBeenCalledWith('/api/operations');
  });

  it('degrades locally when PostHog cannot be read', async () => {
    vi.mocked(getJson).mockRejectedValue(new Error('PostHog timed out'));

    render(<GrowthJourneyPanel growth={GROWTH} />);

    expect(
      await screen.findByText('Journey telemetry unavailable'),
    ).toBeVisible();
    expect(screen.getByText('PostHog timed out')).toBeVisible();
  });
});
