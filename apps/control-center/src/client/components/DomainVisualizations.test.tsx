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

  it('ranks source events by severity then recency and keeps only the top two', () => {
    const data = operationsFixture({
      signals: [
        signalFixture({
          fingerprint: 'github-actions:healthy-newest',
          source: 'github-actions',
          domain: 'jobs',
          status: 'healthy',
          observedAt: '2026-08-28T11:59:00.000Z',
          title: 'Healthy newest',
        }),
        signalFixture({
          fingerprint: 'github-actions:critical-older',
          source: 'github-actions',
          domain: 'jobs',
          status: 'critical',
          observedAt: '2026-08-28T10:00:00.000Z',
          title: 'Critical older',
        }),
        signalFixture({
          fingerprint: 'github-actions:degraded-newer',
          source: 'github-actions',
          domain: 'jobs',
          status: 'degraded',
          observedAt: '2026-08-28T11:58:00.000Z',
          title: 'Degraded newer',
        }),
        signalFixture({
          fingerprint: 'github-actions:critical-newer',
          source: 'github-actions',
          domain: 'jobs',
          status: 'critical',
          observedAt: '2026-08-28T11:00:00.000Z',
          title: 'Critical newer',
        }),
      ],
    });

    render(<ReliabilityTopology data={data} social={null} />);

    const events = screen
      .getByText('GitHub')
      .closest('.source-activity-card')!
      .querySelectorAll('.source-event strong');
    expect([...events].map((event) => event.textContent)).toEqual([
      'Critical newer',
      'Critical older',
    ]);
    expect(screen.queryByText('Degraded newer')).toBeNull();
    expect(screen.queryByText('Healthy newest')).toBeNull();
  });

  it('distinguishes exhausted, overdue, and healthy queue severity', () => {
    const baseJob = socialOps().jobs[0]!;
    const cases = [
      {
        attemptsExhausted: true,
        overdueMinutes: null as number | null,
        expectedClass: 'critical',
        blocked: '1 blocked',
      },
      {
        attemptsExhausted: false,
        overdueMinutes: 15 as number | null,
        expectedClass: 'degraded',
        blocked: '1 blocked',
      },
      {
        attemptsExhausted: false,
        overdueMinutes: null as number | null,
        expectedClass: 'healthy',
        blocked: '0 blocked',
      },
    ] as const;

    assertTopologyNodeSeverity(
      'Queue',
      cases.map((testCase) => {
        const social = socialOps();
        social.jobs = [
          {
            ...baseJob,
            attemptsExhausted: testCase.attemptsExhausted,
            overdueMinutes: testCase.overdueMinutes,
          },
        ];
        return {
          social,
          expectedClass: testCase.expectedClass,
          expectedText: testCase.blocked,
        };
      }),
    );
  });

  it('degrades media only when three or more lanes are waiting', () => {
    const cases = [
      { waitingMediaLanes: 2, expectedClass: 'healthy' },
      { waitingMediaLanes: 3, expectedClass: 'degraded' },
    ] as const;

    assertTopologyNodeSeverity(
      'Media',
      cases.map((testCase) => {
        const social = socialOps();
        social.waitingMediaLanes = testCase.waitingMediaLanes;
        return {
          social,
          expectedClass: testCase.expectedClass,
          expectedText: `${testCase.waitingMediaLanes} waiting`,
        };
      }),
    );
  });

  function assertTopologyNodeSeverity(
    nodeLabel: string,
    cases: Array<{
      social: OperationsSocialResponse;
      expectedClass: string;
      expectedText: string;
    }>,
  ): void {
    let rerender: ReturnType<typeof render>['rerender'] | null = null;
    for (const [index, entry] of cases.entries()) {
      if (index === 0) {
        const result = render(
          <ReliabilityTopology data={null} social={entry.social} />,
        );
        rerender = result.rerender;
      } else {
        rerender!(<ReliabilityTopology data={null} social={entry.social} />);
      }
      expect(
        screen.getByText(nodeLabel).closest('.social-flow-node'),
      ).toHaveClass(entry.expectedClass);
      expect(screen.getByText(entry.expectedText)).toBeVisible();
    }
  }
});
