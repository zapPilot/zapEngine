import { describe, expect, it } from 'vitest';

import {
  parseRunEpisodeId,
  storyEpisodeId,
} from '@/integration/agentRunContext';

import { agentRunStatus } from './support/agentRunStatus';

const EPISODE = 'ae4bb0a1-d610-4dd8-8c57-4e630cf39b07';

describe('parseRunEpisodeId', () => {
  it('reads the episode from the run link', () => {
    expect(parseRunEpisodeId({ episode: EPISODE })).toBe(EPISODE);
  });

  it('ignores the Laya analysis params older links still carry', () => {
    expect(
      parseRunEpisodeId({
        episode: EPISODE,
        hack: '0.6312',
        eth: 'upward',
        upward: '0.7689',
      }),
    ).toBe(EPISODE);
  });

  it('treats a bare page as not provided', () => {
    expect(parseRunEpisodeId({})).toBeNull();
  });

  it('takes the first value of a repeated param', () => {
    expect(parseRunEpisodeId({ episode: [EPISODE, 'x'] })).toBe(EPISODE);
    expect(parseRunEpisodeId({ episode: [] })).toBeNull();
  });

  it.each([
    [{ episode: 'not-a-uuid' }],
    [{ episode: `${EPISODE}/../x` }],
    [{ episode: '' }],
  ])('rejects a malformed episode id %j', (params) => {
    expect(parseRunEpisodeId(params)).toBeNull();
  });
});

describe('storyEpisodeId', () => {
  const OTHER = '0f85db1e-ae06-45ea-89a7-360ec63ff072';
  const running = agentRunStatus({ activeStep: 'news', episode: OTHER });
  const finished = agentRunStatus({
    state: 'succeeded',
    finishedAt: 2_000,
    episode: OTHER,
  });

  it('shows the story of a run in progress, even over a run link', () => {
    expect(storyEpisodeId({ urlEpisodeId: EPISODE, run: running })).toBe(OTHER);
    expect(storyEpisodeId({ urlEpisodeId: null, run: running })).toBe(OTHER);
  });

  it('prefers the run link once no run is in progress', () => {
    expect(storyEpisodeId({ urlEpisodeId: EPISODE, run: finished })).toBe(
      EPISODE,
    );
    expect(storyEpisodeId({ urlEpisodeId: EPISODE, run: null })).toBe(EPISODE);
  });

  it('falls back to a finished run, never to an idle agent', () => {
    expect(storyEpisodeId({ urlEpisodeId: null, run: finished })).toBe(OTHER);
    expect(
      storyEpisodeId({
        urlEpisodeId: null,
        run: agentRunStatus({ state: 'idle', startedAt: null }),
      }),
    ).toBeNull();
    expect(storyEpisodeId({ urlEpisodeId: null, run: null })).toBeNull();
  });

  it('validates the run episode like a link', () => {
    expect(
      storyEpisodeId({
        urlEpisodeId: EPISODE,
        run: { ...running, episode: '../x' },
      }),
    ).toBeNull();
  });
});
