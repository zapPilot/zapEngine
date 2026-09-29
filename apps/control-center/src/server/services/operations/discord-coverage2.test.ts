import { afterEach, describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../../config/env.js';
import {
  createDiscordCommunityReader,
  readDiscordCommunity,
} from './discord.js';

const now = new Date('2026-09-19T00:00:00Z');
const invite = {
  guild: { id: '123', name: 'Zap Pilot' },
  approximate_member_count: 37,
  approximate_presence_count: 4,
  expires_at: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('discord missing branches', () => {
  it('falls back to global fetch when no impl is injected', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(invite));
    vi.stubGlobal('fetch', fetchImpl);

    const result = await readDiscordCommunity({
      inviteCode: 'd3vXUtcFCJ',
      now,
    });

    expect(fetchImpl).toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'ok', memberCount: 37 });
  });

  it('degrades a non-Error rejection without leaking', async () => {
    const result = await readDiscordCommunity({
      inviteCode: 'code',
      now,
      fetchImpl: vi.fn().mockRejectedValue('string-boom'),
    });

    expect(result).toMatchObject({
      status: 'unavailable',
      message: 'Discord invite unavailable',
      inviteCode: 'code',
    });
  });

  it('defaults the reader clock when no now is injected', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(invite));
    const read = createDiscordCommunityReader({
      config: readControlCenterConfig({ DISCORD_INVITE_CODE: 'code' }),
      fetchImpl,
    });

    const result = await read();

    expect(result.status).toBe('ok');
    expect(Date.parse(result.observedAt)).toBeLessThanOrEqual(Date.now());
    expect(fetchImpl).toHaveBeenCalled();
  });
});
