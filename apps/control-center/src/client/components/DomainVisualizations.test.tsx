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

    expect(screen.getByText('Publishing now')).toBeVisible();
    expect(screen.getByText('Buy in fear')).toBeVisible();
    expect(screen.getByText('Threads')).toBeVisible();
    expect(screen.getByText('ja')).toBeVisible();
    expect(screen.getByText('Retries exhausted')).toBeVisible();
    expect(screen.getByText('1 blocked · 2 active')).toBeVisible();
  });

  it('shows source activity as compact clickable events', () => {
    const data = operationsFixture({
      signals: [
        signalFixture({
          fingerprint: 'github-actions:recent-failure/deploy.yml',
          source: 'github-actions',
          domain: 'jobs',
          status: 'critical',
          title: 'Deploy failed',
          evidence: {
            conclusion: 'failure',
            event: 'push',
            branch: 'main',
          },
          url: 'https://github.com/zapPilot/zapEngine/actions/runs/1',
        }),
        signalFixture({
          fingerprint: 'sentry:issues/zap-pilot-native',
          source: 'sentry',
          domain: 'errors',
          status: 'degraded',
          title: '2 unresolved issues in zap-pilot-native',
          evidence: {
            eventCount: 11,
            topIssue: 'useWalletProvider',
          },
          url: 'https://sentry.io/issues/1',
        }),
      ],
    });

    render(<ReliabilityTopology data={data} social={socialOps()} />);

    expect(screen.getByText('2 need attention')).toBeVisible();
    expect(screen.getByText('GitHub')).toBeVisible();
    expect(screen.getByText('Deploy failed')).toBeVisible();
    expect(screen.getByText('Sentry')).toBeVisible();
    expect(
      screen.getByText('2 unresolved issues in zap-pilot-native'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: /Deploy failed/ })).toHaveAttribute(
      'href',
      'https://github.com/zapPilot/zapEngine/actions/runs/1',
    );
    expect(
      screen.getByRole('link', {
        name: /2 unresolved issues in zap-pilot-native/,
      }),
    ).toHaveAttribute('href', 'https://sentry.io/issues/1');
    expect(screen.getByText('Media')).toBeVisible();
    expect(screen.getByText('4 waiting')).toBeVisible();
    expect(screen.getByText('Platforms')).toBeVisible();
    expect(screen.getByText('not verified')).toBeVisible();
  });
});
