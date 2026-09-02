// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { ReliabilityTopology } from './ReliabilityTopology.js';
import { operationsFixture, signalFixture } from '../__fixtures__/dashboard.js';

afterEach(cleanup);

describe('ReliabilityTopology source ordering', () => {
  it('orders source cards by worst status while excluding unknown from attention', () => {
    const data = operationsFixture({
      signals: [
        signalFixture({
          fingerprint: 'product-health:healthy',
          source: 'product-health',
          status: 'healthy',
          title: 'Product healthy',
        }),
        signalFixture({
          fingerprint: 'github-actions:degraded',
          source: 'github-actions',
          status: 'degraded',
          title: 'GitHub degraded',
        }),
        signalFixture({
          fingerprint: 'sentry:critical',
          source: 'sentry',
          status: 'critical',
          title: 'Sentry critical',
        }),
        signalFixture({
          fingerprint: 'fly:degraded',
          source: 'fly',
          status: 'degraded',
          title: 'Fly degraded',
        }),
        signalFixture({
          fingerprint: 'posthog:unknown',
          source: 'posthog',
          status: 'unknown',
          title: 'PostHog unknown',
        }),
      ],
    });

    render(<ReliabilityTopology data={data} social={null} />);

    const labels = [
      ...document.querySelectorAll('.source-activity-card header strong'),
    ].map((node) => node.textContent);
    expect(labels).toEqual(['Sentry', 'Fly', 'GitHub', 'PostHog', 'Product']);
    expect(screen.getByText('3 need attention')).toBeVisible();
  });

  it('keeps healthy and unknown evidence visible while reporting all clear', () => {
    const data = operationsFixture({
      signals: [
        signalFixture({
          status: 'healthy',
          title: 'Product healthy',
          source: 'product-health',
          fingerprint: 'product-health:healthy-only',
        }),
        signalFixture({
          title: 'PostHog unknown',
          status: 'unknown',
          fingerprint: 'posthog:unknown-only',
          source: 'posthog',
        }),
      ],
    });

    render(<ReliabilityTopology data={data} social={null} />);

    expect(screen.getByText('All clear')).toBeVisible();
    expect(screen.getByText('Product healthy')).toBeVisible();
    expect(screen.getByText('PostHog unknown')).toBeVisible();
    expect(screen.queryByText(/need attention/)).not.toBeInTheDocument();
  });

  it('preserves zero-valued source evidence instead of treating it as missing', () => {
    const zeroEvidence = signalFixture();
    Object.assign(zeroEvidence, {
      fingerprint: 'social-queue:zero-evidence',
      source: 'social-queue',
      status: 'healthy',
      title: 'Social queue healthy',
      evidence: { overdueJobs: 0, waitingMediaLanes: 0 },
    });
    const data = operationsFixture({ signals: [zeroEvidence] });

    render(<ReliabilityTopology data={data} social={null} />);

    expect(
      screen.getByText('overdue jobs 0 · waiting media lanes 0'),
    ).toBeVisible();
    expect(screen.queryByText('No extra detail')).not.toBeInTheDocument();
  });

  it('falls back to diagnostic detail when structured evidence is missing', () => {
    const detailOnly = signalFixture();
    Object.assign(detailOnly, {
      fingerprint: 'social-queue:detail-only',
      source: 'social-queue',
      title: 'Social queue delayed',
      evidence: { overdueJobs: null, waitingMediaLanes: '' },
      detail: 'Scheduler heartbeat is stale',
    });
    const data = operationsFixture({ signals: [detailOnly] });

    render(<ReliabilityTopology data={data} social={null} />);

    expect(screen.getByText('Scheduler heartbeat is stale')).toBeVisible();
    expect(screen.queryByText('No extra detail')).not.toBeInTheDocument();
  });

  it('shows an explicit fallback when evidence and detail are both missing', () => {
    const emptyMetadata = signalFixture();
    Object.assign(emptyMetadata, {
      fingerprint: 'social-queue:empty-metadata',
      source: 'social-queue',
      title: 'Social queue signal',
      evidence: { overdueJobs: null, waitingMediaLanes: '' },
      detail: undefined,
    });
    const data = operationsFixture({ signals: [emptyMetadata] });

    render(<ReliabilityTopology data={data} social={null} />);

    expect(screen.getByText('No extra detail')).toBeVisible();
  });
});
