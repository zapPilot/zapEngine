import { describe, expect, it } from 'vitest';

import { parseAgentRunContext } from '@/integration/agentRunContext';

const EPISODE = 'ae4bb0a1-d610-4dd8-8c57-4e630cf39b07';

describe('parseAgentRunContext', () => {
  it('reads the episode and Laya analysis from the run link', () => {
    expect(
      parseAgentRunContext({
        episode: EPISODE,
        hack: '0.6312',
        eth: 'upward',
        upward: '0.7689',
        downward: '0.1096',
        none: '0.1215',
      }),
    ).toEqual({
      episodeId: EPISODE,
      analysis: {
        exchangeHack: 0.6312,
        pressure: 'upward',
        probabilities: { upward: 0.7689, downward: 0.1096, none: 0.1215 },
      },
    });
  });

  it('treats a bare page as not provided', () => {
    expect(parseAgentRunContext({})).toEqual({
      episodeId: null,
      analysis: null,
    });
  });

  it('keeps the episode when Laya was unavailable for the run', () => {
    expect(parseAgentRunContext({ episode: [EPISODE, 'x'] })).toEqual({
      episodeId: EPISODE,
      analysis: null,
    });
  });

  it.each([[{ episode: 'not-a-uuid' }], [{ episode: `${EPISODE}/../x` }]])(
    'rejects a malformed episode id %j',
    (params) => {
      expect(parseAgentRunContext(params).episodeId).toBeNull();
    },
  );

  it.each([
    [{ hack: '1.2', eth: 'upward' }],
    [{ hack: '', eth: 'upward' }],
    [{ hack: 'NaN', eth: 'upward' }],
    [{ hack: '0.9', eth: 'sideways' }],
    [{ hack: '0.9' }],
  ])('drops an invalid analysis %j', (params) => {
    expect(parseAgentRunContext(params).analysis).toBeNull();
  });

  it('keeps only valid pressure probabilities', () => {
    expect(
      parseAgentRunContext({
        hack: '0.9',
        eth: 'none',
        upward: '-1',
        none: '0.5',
      }).analysis?.probabilities,
    ).toEqual({ none: 0.5 });
  });
});
