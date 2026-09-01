// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';

import type { OperationsSocialResponse } from '../../shared/types.js';
import {
  operationsFixture,
  signalFixture,
  socialFixture,
} from '../__fixtures__/dashboard.js';
import { GrowthDistributionBoard } from './GrowthDistributionBoard.js';
import { ReliabilityTopology } from './ReliabilityTopology.js';

afterEach(cleanup);

const NOW = '2026-08-28T12:00:00.000Z';

function socialOps(): OperationsSocialResponse {
  return {
    generatedAt: NOW,
    daemon: {
      status: 'degraded',
      owner: 'laptop-jst',
      daemonVersion: '2026.08.28',
      firstStartedAt: '2026-08-01T00:00:00.000Z',
      lastTickStartedAt: '2026-08-28T11:30:00.000Z',
      lastTickCompletedAt: '2026-08-28T11:30:05.000Z',
      lastSuccessAt: '2026-08-28T11:30:05.000Z',
      lastError: null,
      staleMinutes: 30,
    },
    jobs: [
      {
        episodeId: 'ep-1',
        platform: 'threads',
        languageCode: 'ja',
        status: 'queued',
        scheduledAt: '2026-08-28T11:00:00.000Z',
        nextAttemptAt: '2026-08-28T11:55:00.000Z',
        attemptCount: 0,
        overdueMinutes: null,
        attemptsExhausted: false,
      },
      {
        episodeId: 'ep-1',
        platform: 'x',
        languageCode: 'en',
        status: 'failed',
        scheduledAt: '2026-08-28T11:00:00.000Z',
        nextAttemptAt: '2026-08-28T11:40:00.000Z',
        attemptCount: 8,
        overdueMinutes: 20,
        attemptsExhausted: true,
      },
    ],
    waitingMediaLanes: 4,
    invalidJobRows: 0,
    message: null,
  };
}

describe('domain-native control center visualizations', () => {
  it('groups active publish lanes by article and exposes blocked lane state', () => {
    render(
      <GrowthDistributionBoard
        performance={socialFixture()}
        social={socialOps()}
      />,
    );

    expect(screen.getByText('Content distribution board')).toBeVisible();
    expect(screen.getByText('Buy in fear')).toBeVisible();
    expect(screen.getByText('Threads')).toBeVisible();
    expect(screen.getByText('ja')).toBeVisible();
    expect(screen.getByText('Retries exhausted')).toBeVisible();
    expect(screen.getByText('1 blocked · 2 active')).toBeVisible();
  });

  it('shows evidence topology without claiming unverified platform health', () => {
    const data = operationsFixture({
      signals: [
        signalFixture({
          source: 'fly',
          domain: 'infra',
          status: 'critical',
          title: 'Render worker stopped',
        }),
        signalFixture({
          fingerprint: 'github-actions:workflow/healthy',
          source: 'github-actions',
          domain: 'jobs',
          status: 'healthy',
          title: 'Scheduled jobs healthy',
        }),
      ],
    });

    render(<ReliabilityTopology data={data} social={socialOps()} />);

    expect(
      screen.getByText('What is reporting trouble, and what it blocks'),
    ).toBeVisible();
    expect(screen.getByText('Fly.io')).toBeVisible();
    expect(screen.getByText('Render worker stopped')).toBeVisible();
    expect(screen.getByText('Rendered media')).toBeVisible();
    expect(screen.getByText('4 lane(s) waiting')).toBeVisible();
    expect(screen.getByText('Distribution targets')).toBeVisible();
    expect(
      screen.getByText('Outcome health is not verified by this read model'),
    ).toBeVisible();
  });
});
