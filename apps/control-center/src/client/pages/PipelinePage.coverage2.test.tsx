// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { PipelineQueuesResponse } from '../../shared/pipeline-queues.js';
import type { PodcastCostResponse } from '../../shared/types.js';
import { podcastEpisodeCostFixture } from '../__fixtures__/dashboard.js';
import { PipelineSummary } from './PipelinePage.js';

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

describe('PipelinePage coverage2', () => {
  it('tolerates a visual job without a current step when bucketing stages', () => {
    render(
      <PipelineSummary
        podcastCosts={null}
        queues={queues({
          render: {
            ...emptyLane,
            processing: [
              {
                actions: {},
                currentStep: undefined,
                history: [],
                key: 'visual-nostep',
                kind: 'visual',
                publishedLinks: [],
                retryCount: 0,
                state: 'processing',
                title: 'Visual without step',
              },
            ],
          } as Partial<PipelineQueuesResponse> as never,
        })}
      />,
    );
    expect(screen.getByText('視覺規劃')).toBeVisible();
  });

  it('reads failed-attempt rows when the ledger has no episodes array', () => {
    render(
      <PipelineSummary
        podcastCosts={{ episodes: undefined } as unknown as PodcastCostResponse}
        queues={queues()}
      />,
    );
    expect(screen.getByText('失敗嘗試成本')).toBeVisible();
  });

  it('sorts multiple failed-attempt episodes by cost descending', () => {
    render(
      <PipelineSummary
        podcastCosts={{
          episodes: [
            podcastEpisodeCostFixture({
              episodeId: 'ep-cheap',
              failedAttemptCostUsd: 0.5,
              title: 'Cheap episode',
            }),
            podcastEpisodeCostFixture({
              episodeId: 'ep-pricey',
              failedAttemptCostUsd: 4,
              title: 'Pricey episode',
            }),
          ],
          generatedAt: '2026-09-10T01:00:00Z',
          message: null,
          status: 'ok',
        }}
        queues={queues()}
      />,
    );
    expect(screen.getByText('Cheap episode')).toBeVisible();
    expect(screen.getByText('Pricey episode')).toBeVisible();
  });

  it('falls back to the episode id when a costly episode has no title', () => {
    render(
      <PipelineSummary
        podcastCosts={{
          episodes: [
            podcastEpisodeCostFixture({
              episodeId: 'ep-untitled',
              failedAttemptCostUsd: 3,
              title: null as unknown as string,
            }),
          ],
          generatedAt: '2026-09-10T01:00:00Z',
          message: null,
          status: 'ok',
        }}
        queues={queues()}
      />,
    );
    expect(screen.getByText('ep-untitled')).toBeVisible();
  });

  it('reads a null podcast cost response without crashing', () => {
    render(<PipelineSummary podcastCosts={null} queues={queues()} />);
    expect(screen.getByText('Ledger unavailable')).toBeVisible();
  });
});
