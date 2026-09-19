import { z } from 'zod';
import {
  unavailableDiscordCommunity,
  type DiscordCommunitySummary,
} from '../../../shared/growth.js';
import type { ControlCenterConfig } from '../../config/env.js';
import { createAsyncCache } from '../cache.js';
import { fetchJson } from './http.js';

const inviteSchema = z.object({
  guild: z.object({ id: z.string().min(1), name: z.string().min(1) }),
  approximate_member_count: z.number().int().nonnegative(),
  approximate_presence_count: z.number().int().nonnegative().nullish(),
  expires_at: z.string().datetime().nullish(),
});

export async function readDiscordCommunity(input: {
  inviteCode?: string;
  now: Date;
  fetchImpl?: typeof fetch;
}): Promise<DiscordCommunitySummary> {
  const observedAt = input.now.toISOString();
  const inviteCode = input.inviteCode?.trim() || null;
  if (!inviteCode) {
    return unavailableDiscordCommunity(
      'Discord invite is not configured',
      observedAt,
    );
  }
  try {
    const invite = await fetchJson({
      label: 'Discord invite request',
      url: `https://discord.com/api/v10/invites/${encodeURIComponent(inviteCode)}?with_counts=true`,
      schema: inviteSchema,
      fetchImpl: input.fetchImpl ?? globalThis.fetch,
    });
    return {
      status: 'ok',
      message: null,
      inviteCode,
      guildId: invite.guild.id,
      guildName: invite.guild.name,
      memberCount: invite.approximate_member_count,
      presenceCount: invite.approximate_presence_count ?? null,
      inviteExpiresAt: invite.expires_at ?? null,
      observedAt,
    };
  } catch (error) {
    return unavailableDiscordCommunity(
      error instanceof Error ? error.message : 'Discord invite unavailable',
      observedAt,
      inviteCode,
    );
  }
}

export function createDiscordCommunityReader(input: {
  config: ControlCenterConfig;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}) {
  const cache = createAsyncCache({
    ttlMs: 15 * 60_000,
    load: () =>
      readDiscordCommunity({
        inviteCode: input.config.DISCORD_INVITE_CODE,
        now: input.now?.() ?? new Date(),
        fetchImpl: input.fetchImpl,
      }),
  });
  return (force = false) => cache.get(force);
}
