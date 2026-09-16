// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, within } from '@testing-library/react';
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

function podcastCosts(
  overrides: Partial<ReturnType<typeof podcastEpisodeCostFixture>> = {},
): PodcastCostResponse {
  return {
    episodes: [podcastEpisodeCostFixture({ episodeId: 'ep-1', ...overrides })],
    generatedAt: '2026-09-10T01:00:00Z',
    message: null,
    status: 'ok',
  };
}

const socialItem = {
  contentType: 'video',
  episodeId: 'episode-social',
  history: [],
  key: 'social-1',
  platforms: [
    {
      languageCode: 'en',
      platform: 'x',
      retryCount: 0,
      scheduledAt: '2026-09-10T01:00:00Z',
      status: 'published',
    },
    {
      languageCode: 'en',
      platform: 'threads',
      retryCount: 1,
      scheduledAt: '2026-09-10T01:00:00Z',
      status: 'failed',
    },
    {
      languageCode: 'zh-Hant',
      platform: 'rednote',
      retryCount: 0,
      scheduledAt: '2026-09-10T01:00:00Z',
      status: 'queued',
    },
  ],
  publishedLinks: [],
  scheduledAt: '2026-09-10T01:00:00Z',
  state: 'publishing',
  title: 'An episode being published',
};

describe('PipelinePage coverage', () => {
  it('counts ingest work in the first stage', () => {
    render(
      <PipelineSummary
        podcastCosts={null}
        queues={queues({
          api: {
            ...emptyLane,
            processing: [
              {
                actions: {},
                history: [],
                key: 'api-1',
                kind: 'ingest',
                publishedLinks: [],
                retryCount: 0,
                state: 'processing',
                title: 'Ingest work',
              },
            ],
          } as Partial<PipelineQueuesResponse> as never,
        })}
      />,
    );

    const stage = screen
      .getByText('擷取 / 翻譯 / TTS')
      .closest('.cc-flow-stage');
    expect(within(stage as HTMLElement).getByText('1')).toBeVisible();
  });

  it('counts visual planning separately from image search', () => {
    render(
      <PipelineSummary
        podcastCosts={null}
        queues={queues({
          render: {
            ...emptyLane,
            processing: [
              {
                actions: {},
                currentStep: 'planning-scenes',
                history: [],
                key: 'visual-plan',
                kind: 'visual',
                publishedLinks: [],
                retryCount: 0,
                state: 'processing',
                title: 'Planning',
              },
              {
                actions: {},
                currentStep: 'Rendering',
                history: [],
                key: 'render-1',
                kind: 'render',
                publishedLinks: [],
                retryCount: 0,
                state: 'processing',
                title: 'Rendering',
              },
            ],
          } as Partial<PipelineQueuesResponse> as never,
        })}
      />,
    );

    expect(screen.getByText('視覺規劃')).toBeVisible();
    expect(screen.getByText('圖片搜尋')).toBeVisible();
    expect(screen.getByText('Render')).toBeVisible();
  });

  it('reports per-platform publish counts with a failure pill', () => {
    render(
      <PipelineSummary
        podcastCosts={null}
        queues={queues({
          social: { ...emptyLane, queued: [socialItem] },
        } as Partial<PipelineQueuesResponse>)}
      />,
    );

    expect(screen.getByText(/已發佈 1 · 等待 0/)).toBeVisible();
    expect(screen.getByText('失敗 1')).toBeVisible();
    expect(screen.getByText(/尚未收尾的發佈/)).toBeVisible();
  });

  it('says the publish queue has not loaded yet', () => {
    render(<PipelineSummary podcastCosts={null} queues={null} />);

    expect(screen.getByText('Loading queues')).toBeVisible();
    expect(screen.getByText('No publish state')).toBeVisible();
  });

  it('spells out a deploy interruption separately from other shutdowns', () => {
    render(
      <PipelineSummary
        podcastCosts={podcastCosts({
          interruptedAttemptCostUsd: 1.5,
          confirmedDeploymentInterruptionCostUsd: 1,
          shutdownInterruptionCostUsd: 0.5,
        })}
        queues={queues()}
      />,
    );

    expect(screen.getByText(/Deploy/)).toBeVisible();
  });

  it('confirms a clean lineage once every failure carries a reason', () => {
    render(
      <PipelineSummary
        podcastCosts={podcastCosts({
          confirmedRetryWasteUsd: 0,
          confirmedRetryWasteIsLowerBound: false,
          interruptedAttemptCostUsd: 0,
          unknownFailureReasonStages: 0,
        })}
        queues={queues()}
      />,
    );

    expect(
      screen.getByText('Every failed stage carries a reason'),
    ).toBeVisible();
    expect(
      screen.getByText('Every priced render stage has lineage'),
    ).toBeVisible();
  });
});
