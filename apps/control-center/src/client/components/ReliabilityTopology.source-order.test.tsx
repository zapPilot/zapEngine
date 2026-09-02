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
});
