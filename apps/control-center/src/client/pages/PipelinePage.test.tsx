// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { PipelineQueuesResponse } from '../../shared/pipeline-queues.js';
import type {
  PodcastCostResponse,
  PodcastEpisodeCostSummary,
} from '../../shared/types.js';
import { podcastEpisodeCostFixture } from '../__fixtures__/dashboard.js';
import { PipelineSummary } from './PipelinePage.js';

afterEach(cleanup);

function statFor(label: string): HTMLElement {
  const stat = screen.getByText(label).closest('.cc-stat');
  expect(stat).not.toBeNull();
  return stat as HTMLElement;
}

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

function podcastCosts(
  episode: Partial<PodcastEpisodeCostSummary> = {},
): PodcastCostResponse {
  return {
    episodes: [
      podcastEpisodeCostFixture({
        episodeId: 'ep-1',
        title: 'Costly episode',
        failedAttemptCostUsd: 2,
        ...episode,
      }),
    ],
    generatedAt: '2026-09-10T01:00:00Z',
    message: null,
    status: 'ok',
  };
}

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

  it('flags a failed social release as needing attention', () => {
    render(
      <PipelineSummary
        podcastCosts={null}
        queues={queues({
          social: {
            ...emptyLane,
            attention: [{ ...socialJob, state: 'failed' }],
          },
        } as Partial<PipelineQueuesResponse>)}
      />,
    );
    const stage = screen.getByText('社群發佈').closest('.cc-flow-stage');
    expect(stage).not.toBeNull();
    expect(within(stage as HTMLElement).getByText('1 需介入')).toBeVisible();
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

describe('Pipeline failed-attempt cost', () => {
  it('ranks the episodes carrying the failed-attempt cost', () => {
    render(<PipelineSummary podcastCosts={podcastCosts()} queues={queues()} />);
    expect(screen.getByText('20.0%')).toBeVisible();
    expect(screen.getByText('Costly episode')).toBeVisible();
  });

  // The card used to call this "重試浪費 / Retry share / Sunk cost", which
  // asserts a rerun the ledger never recorded. The wording is the fix, so it is
  // what the test holds.
  it('names failed attempts rather than proven retries', () => {
    render(<PipelineSummary podcastCosts={podcastCosts()} queues={queues()} />);

    expect(screen.getByText('失敗嘗試成本')).toBeVisible();
    expect(screen.getByText('Failed-attempt share')).toBeVisible();
    expect(screen.getByText('Failed-attempt cost')).toBeVisible();
    expect(screen.getByText('Confirmed retry waste')).toBeVisible();
    expect(screen.getByText('Interrupted attempts')).toBeVisible();
    expect(
      screen.getByText('of all episode spend (podcast + video)'),
    ).toBeVisible();
    expect(screen.queryByText('重試浪費')).toBeNull();
    expect(screen.queryByText('Retry share')).toBeNull();
    expect(screen.queryByText('Sunk cost')).toBeNull();
  });

  it('shows unknown, never $0.00, where no lineage was recorded', () => {
    render(<PipelineSummary podcastCosts={podcastCosts()} queues={queues()} />);

    const stat = statFor('Confirmed retry waste');
    expect(within(stat).getByText('Unknown')).toBeVisible();
    expect(within(stat).queryByText('$0.00')).toBeNull();
    expect(
      screen.getByText('No render lineage recorded for these episodes'),
    ).toBeVisible();
  });

  it('reads partial lineage as a floor and names the gap', () => {
    render(
      <PipelineSummary
        podcastCosts={podcastCosts({
          confirmedRetryWasteUsd: 0,
          confirmedRetryWasteIsLowerBound: true,
          unknownLineageStages: 3,
        })}
        queues={queues()}
      />,
    );

    expect(screen.getByText('≥ $0.00')).toBeVisible();
    expect(
      screen.getByText('3 priced render stages predate lineage'),
    ).toBeVisible();
  });

  it('states an exact figure once lineage is complete', () => {
    render(
      <PipelineSummary
        podcastCosts={podcastCosts({
          confirmedRetryWasteUsd: 0.02,
          confirmedRetryWasteIsLowerBound: false,
        })}
        queues={queues()}
      />,
    );

    expect(screen.getByText('$0.02')).toBeVisible();
    expect(
      screen.getByText('Every priced render stage has lineage'),
    ).toBeVisible();
  });

  it('cannot claim zero interruption while failure reasons are missing', () => {
    render(
      <PipelineSummary
        podcastCosts={podcastCosts({
          interruptedAttemptCostUsd: null,
          unknownFailureReasonStages: 4,
        })}
        queues={queues()}
      />,
    );

    const stat = statFor('Interrupted attempts');
    expect(within(stat).getByText('Unknown')).toBeVisible();
    expect(
      screen.getByText('4 failed stages carry no failure reason'),
    ).toBeVisible();
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
