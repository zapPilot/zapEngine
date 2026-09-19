import { describe, expect, it, vi } from 'vitest';
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

describe('Discord public community read', () => {
  it('uses a public invite with counts and no credentials', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(invite));
    expect(
      await readDiscordCommunity({ inviteCode: 'd3vXUtcFCJ', now, fetchImpl }),
    ).toMatchObject({
      status: 'ok',
      memberCount: 37,
      guildName: 'Zap Pilot',
      presenceCount: 4,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://discord.com/api/v10/invites/d3vXUtcFCJ?with_counts=true',
      expect.objectContaining({ method: 'GET', headers: {} }),
    );
  });
  it('does not request an unconfigured invite', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    expect(await readDiscordCommunity({ now, fetchImpl })).toMatchObject({
      status: 'unavailable',
      memberCount: null,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it.each([
    {},
    { guild: invite.guild },
    { approximate_member_count: 37 },
    { ...invite, approximate_member_count: -1 },
  ])('degrades malformed data to unknown: %j', async (body) => {
    expect(
      await readDiscordCommunity({
        inviteCode: 'code',
        now,
        fetchImpl: vi.fn().mockResolvedValue(Response.json(body)),
      }),
    ).toMatchObject({ status: 'unavailable', memberCount: null });
  });
  it.each([new Response('missing', { status: 404 }), new Response('bad json')])(
    'degrades failed responses',
    async (response) => {
      expect(
        (
          await readDiscordCommunity({
            inviteCode: 'code',
            now,
            fetchImpl: vi.fn().mockResolvedValue(response),
          })
        ).status,
      ).toBe('unavailable');
    },
  );
  it('keeps optional fields unknown and caches until forced', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json({ guild: invite.guild, approximate_member_count: 0 }),
      );
    const read = createDiscordCommunityReader({
      config: readControlCenterConfig({ DISCORD_INVITE_CODE: 'code' }),
      now: () => now,
      fetchImpl,
    });
    const first = await read();
    expect(first).toMatchObject({
      memberCount: 0,
      presenceCount: null,
      inviteExpiresAt: null,
    });
    expect(await read()).toBe(first);
    await read(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
