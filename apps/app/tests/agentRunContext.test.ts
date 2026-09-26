import { describe, expect, it } from 'vitest';

import { parseRunEpisodeId } from '@/integration/agentRunContext';

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
