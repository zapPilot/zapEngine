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

  it('keeps malformed timestamps behind valid events at the same severity', () => {
    const data = operationsFixture({
      signals: [
        signalFixture({
          fingerprint: 'github-actions:invalid-time',
          source: 'github-actions',
          status: 'degraded',
          observedAt: 'not-a-timestamp',
          title: 'Malformed timestamp',
        }),
        signalFixture({
          fingerprint: 'github-actions:older-valid',
          source: 'github-actions',
          status: 'degraded',
          observedAt: '2026-09-01T00:00:00.000Z',
          title: 'Older valid event',
        }),
        signalFixture({
          fingerprint: 'github-actions:newer-valid',
          source: 'github-actions',
          status: 'degraded',
          observedAt: '2026-09-02T00:00:00.000Z',
          title: 'Newer valid event',
        }),
      ],
    });

    render(<ReliabilityTopology data={data} social={null} />);

    const titles = [...document.querySelectorAll('.source-event strong')].map(
      (node) => node.textContent,
    );
    expect(titles).toEqual(['Newer valid event', 'Older valid event']);
    expect(screen.queryByText('Malformed timestamp')).not.toBeInTheDocument();
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

  it('shows the empty state without inventing source activity', () => {
    const data = operationsFixture({ signals: [] });

    render(<ReliabilityTopology data={data} social={null} />);

    expect(screen.getByText('All clear')).toBeVisible();
    expect(screen.getByText('Waiting for signals.')).toBeVisible();
    expect(document.querySelector('.source-activity-card')).toBeNull();
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
