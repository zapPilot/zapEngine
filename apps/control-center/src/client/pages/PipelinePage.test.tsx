// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { PipelineQueuesResponse } from '../../shared/pipeline-queues.js';
import type { PodcastCostResponse } from '../../shared/types.js';
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

const visualJob = {
  actions: {},
  currentStep: 'selecting-images',
  history: [],
  key: 'visual-1',
  kind: 'visual',
  publishedLinks: [],
  retryCount: 0,
  state: 'processing',
  title: 'An episode being illustrated',
};

const socialJob = {
  contentType: 'video',
  episodeId: 'episode-social',
  history: [],
  key: 'social-1',
  platforms: [],
  publishedLinks: [],
  scheduledAt: '2026-09-10T01:00:00Z',
  state: 'publishing',
  title: 'An episode being published',
};

const podcastCosts: PodcastCostResponse = {
  episodes: [
    {
      breakdown: [],
      episodeId: 'ep-1',
      failedRuns: 1,
      lastRunAt: '2026-09-10T00:30:00Z',
      podcastCostUsd: 7,
      retryWasteUsd: 2,
      runCount: 2,
      title: 'Costly episode',
      totalCostUsd: 10,
      unpricedStages: 0,
      videoCostUsd: 3,
    },
  ],
  generatedAt: '2026-09-10T01:00:00Z',
  message: null,
  status: 'ok',
};

describe('Pipeline stage map', () => {
  it('counts work in flight per stage', () => {
    render(
      <PipelineSummary
        podcastCosts={null}
        queues={queues({
          render: { ...emptyLane, processing: [visualJob] },
        } as Partial<PipelineQueuesResponse>)}
      />,
    );
    expect(screen.getByText('圖片搜尋')).toBeVisible();
    expect(screen.getByText('視覺規劃')).toBeVisible();
  });

  it('counts social releases instead of hard-coding the stage to zero', () => {
    render(
      <PipelineSummary
        podcastCosts={null}
        queues={queues({
          social: { ...emptyLane, processing: [socialJob] },
        } as Partial<PipelineQueuesResponse>)}
      />,
    );
    const stage = screen.getByText('社群發佈').closest('.cc-flow-stage');
    expect(stage).not.toBeNull();
    expect(within(stage as HTMLElement).getByText('1')).toBeVisible();
  });

  it('says why translation and TTS are not counted separately', () => {
    render(<PipelineSummary podcastCosts={null} queues={queues()} />);
    expect(screen.getByText(/翻譯與 TTS 在同一個擷取工作內執行/)).toBeVisible();
  });

  it('reads an idle pipeline as idle, not as broken', () => {
    render(<PipelineSummary podcastCosts={null} queues={queues()} />);
    expect(screen.getByText('佇列是空的')).toBeVisible();
  });

  it('reports a queue read failure separately from an empty queue', () => {
    render(
      <PipelineSummary
        podcastCosts={null}
        queues={queues({ message: 'Queue read failed', status: 'error' })}
      />,
    );
    expect(screen.getAllByText('Queues unavailable').length).toBeGreaterThan(0);
    expect(screen.queryByText('佇列是空的')).toBeNull();
  });
});

describe('Pipeline retry waste', () => {
  it('ranks the episodes carrying the sunk cost', () => {
    render(<PipelineSummary podcastCosts={podcastCosts} queues={queues()} />);
    expect(screen.getByText('20.0%')).toBeVisible();
    expect(screen.getByText('Costly episode')).toBeVisible();
  });

  it('names the ledger failure instead of showing zero', () => {
    render(
      <PipelineSummary
        podcastCosts={{
          episodes: [],
          generatedAt: '2026-09-10T01:00:00Z',
          message: 'column ops_pipeline_stage_runs.execution_id does not exist',
          status: 'error',
        }}
        queues={queues()}
      />,
    );
    expect(screen.getByText(/execution_id does not exist/)).toBeVisible();
  });
});
