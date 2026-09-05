// @vitest-environment jsdom
/* jscpd:ignore-start -- standard testing-library/vitest boilerplate */
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PodcastPipelineResponse } from '../../shared/podcast-pipeline.js';
import { PodcastPipelineView } from './PodcastPipelineView.js';
/* jscpd:ignore-end */

const activeId = '11111111-1111-4111-8111-111111111111';
const completedId = '67613f01-4532-454b-85fc-4f2a6f06f49b';

function episode(
  episodeId: string,
  title: string,
  currentPhase: 'video' | 'done',
): PodcastPipelineResponse['episodes'][number] {
  return {
    episodeId,
    title,
    sourceUrl: 'https://example.com/article',
    createdAt: '2026-09-04T00:00:00.000Z',
    currentPhase,
    translationStatus: 'completed',
    ttsStatus: 'completed',
    videoStatus: currentPhase === 'done' ? 'completed' : 'queued',
    ingest: null,
    localizations: [],
    visual: null,
    visualDebug: null,
    renders: [],
    canRestartIngest: false,
    canRestartVideo: false,
    canForceReplanVisual: false,
  };
}

function renderPipeline() {
  const data: PodcastPipelineResponse = {
    generatedAt: '2026-09-04T00:00:00.000Z',
    status: 'ok',
    message: null,
    episodes: [
      episode(activeId, 'Editable title that may change', 'video'),
      episode(completedId, 'Another rewritten title', 'done'),
    ],
  };

  render(
    <PodcastPipelineView
      data={data}
      onLoadVisualDebug={vi.fn()}
      onResolveReview={vi.fn()}
      onRestartStep={vi.fn()}
      onSubmitReview={vi.fn()}
      restartingEpisodeId={null}
      visualDebugByEpisode={{}}
    />,
  );
}

afterEach(cleanup);

describe('PodcastPipelineView episode lookup', () => {
  it('shows the full UUID on every episode card', () => {
    renderPipeline();

    expect(screen.getByText(activeId)).toBeVisible();
    expect(screen.getByText(completedId)).toBeInTheDocument();
  });

  it('finds a completed episode by full UUID even when its title changed', () => {
    renderPipeline();

    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search pipeline episodes' }),
      {
        target: { value: completedId },
      },
    );

    expect(screen.getByText('Another rewritten title')).toBeVisible();
    expect(screen.getByText(completedId)).toBeVisible();
    expect(
      screen.queryByText('Editable title that may change'),
    ).not.toBeInTheDocument();
  });
});
