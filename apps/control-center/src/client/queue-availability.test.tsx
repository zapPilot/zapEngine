// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { PipelineQueuesResponse } from '../shared/pipeline-queues.js';
import { QueuePanel } from './queue-availability.js';

afterEach(cleanup);

const emptyLane = { attention: [], processing: [], queued: [] };

function queues(
  overrides: Partial<PipelineQueuesResponse> = {},
): PipelineQueuesResponse {
  return {
    api: emptyLane,
    generatedAt: '2026-09-10T01:00:00Z',
    message: null,
    render: emptyLane,
    social: emptyLane,
    status: 'ok',
    summary: {
      abandoned: 0,
      blockedOrFailed: 0,
      processing: 0,
      publishedToday: 0,
      queueDepth: 0,
    },
    ...overrides,
  } as PipelineQueuesResponse;
}

describe('QueuePanel', () => {
  it('says the queues have not loaded yet', () => {
    render(<QueuePanel queues={null}>{() => null}</QueuePanel>);

    expect(screen.getByText('Loading queues')).toBeVisible();
    expect(screen.getByText('佇列尚未載入。')).toBeVisible();
  });

  it('names a queue read failure', () => {
    render(
      <QueuePanel queues={queues({ message: 'boom', status: 'error' })}>
        {() => null}
      </QueuePanel>,
    );

    expect(screen.getByText('Queues unavailable')).toBeVisible();
    expect(screen.getByText('boom')).toBeVisible();
  });

  it('falls back to a generic message when the failure names nothing', () => {
    render(
      <QueuePanel queues={queues({ message: null, status: 'error' })}>
        {() => null}
      </QueuePanel>,
    );

    expect(screen.getByText('Queues unavailable')).toBeVisible();
    expect(screen.getByText('佇列讀取失敗。')).toBeVisible();
  });

  it('hands a usable response to its children', () => {
    render(
      <QueuePanel queues={queues()}>
        {(response) => <span>depth {response.summary.queueDepth}</span>}
      </QueuePanel>,
    );

    expect(screen.getByText('depth 0')).toBeVisible();
  });
});
