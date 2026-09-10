// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';

import {
  operationsFixture,
  priorityFixture,
  signalFixture,
} from '../__fixtures__/dashboard.js';
import { PriorityQueue } from './PriorityQueue.js';
import { ReliabilityView } from './ReliabilityView.js';

afterEach(cleanup);

describe('reliability priority clarity', () => {
  it('labels the score as priority and keeps severity attached to the problem', () => {
    const priority = priorityFixture({
      score: 86,
      signal: signalFixture({
        fingerprint: 'github-actions:workflow/ops-cost-sync.yml',
        source: 'github-actions',
        domain: 'jobs',
        status: 'critical',
        title: 'ops-cost-sync failed 4 runs in a row',
      }),
    });

    render(
      <PriorityQueue
        emptyMessage="Nothing needs action."
        priorities={[priority]}
      />,
    );

    expect(
      screen.getByLabelText('Priority score 86 out of 100'),
    ).toHaveTextContent('Priority86');
    expect(screen.getByText('Critical')).toBeVisible();
    expect(
      screen.getByText('ops-cost-sync failed 4 runs in a row'),
    ).toBeVisible();
  });

  it('describes aggregate signals as checks needing attention, not issues', () => {
    const signals = [
      signalFixture({
        fingerprint: 'github-actions:workflow/failed',
        status: 'critical',
        title: 'Workflow failed',
      }),
      signalFixture({
        fingerprint: 'sentry:issues/podcast-pipeline',
        source: 'sentry',
        domain: 'errors',
        status: 'degraded',
        title: '4 unresolved issues in podcast-pipeline',
      }),
      signalFixture({
        fingerprint: 'github-actions:workflow/healthy',
        status: 'healthy',
        title: 'Workflow healthy',
      }),
    ];

    render(
      <ReliabilityView data={operationsFixture({ signals })} social={null} />,
    );

    expect(screen.getByText('2 need attention · 3 checks')).toBeVisible();
    expect(screen.queryByText('2 issues · 3 signals')).toBeNull();
  });
});
