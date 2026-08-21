import { describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({
  getPipelineSupabase: vi.fn(),
  throwSupabaseError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

vi.mock('../services/supabase-client.js', () => supabase);

import { alignPendingSocialPublishSchedules } from './daemon-store.js';

interface AlignmentUpdate {
  id: string | undefined;
  status: string | undefined;
  patch: Record<string, unknown>;
}

class AlignmentMutation {
  private id: string | undefined;
  private status: string | undefined;

  constructor(
    private readonly patch: Record<string, unknown>,
    private readonly updates: AlignmentUpdate[],
  ) {}

  eq(field: string, value: string) {
    if (field === 'id') this.id = value;
    if (field === 'status') this.status = value;
    return this;
  }

  select() {
    return this;
  }

  async maybeSingle() {
    this.updates.push({ id: this.id, status: this.status, patch: this.patch });
    return { data: this.id ? { id: this.id } : null, error: null };
  }
}

class AlignmentTable {
  readonly updates: AlignmentUpdate[] = [];
  private listAttempt = 0;

  private readonly staleSnapshot = [
    {
      id: 'claimed-earliest',
      episode_id: 'episode-status-transition',
      status: 'queued',
      scheduled_at: '2026-08-20T01:00:00.000Z',
      next_attempt_at: '2026-08-20T01:00:00.000Z',
    },
    {
      id: 'target',
      episode_id: 'episode-status-transition',
      status: 'queued',
      scheduled_at: '2026-08-20T05:00:00.000Z',
      next_attempt_at: '2026-08-20T05:00:00.000Z',
    },
  ];

  private readonly recoveredSnapshot = [
    {
      id: 'failed-new-earliest',
      episode_id: 'episode-status-transition',
      status: 'failed',
      scheduled_at: '2026-08-20T03:00:00.000Z',
      next_attempt_at: '2026-08-20T09:00:00.000Z',
    },
    this.staleSnapshot[1],
  ];

  select() {
    return this;
  }

  in() {
    return this;
  }

  async returns() {
    this.listAttempt += 1;
    if (this.listAttempt === 1) {
      return {
        data: this.staleSnapshot,
        error: { message: 'alignment list failed before claim transition' },
      };
    }
    return { data: this.recoveredSnapshot, error: null };
  }

  update(patch: Record<string, unknown>) {
    return new AlignmentMutation(patch, this.updates);
  }
}

describe('alignPendingSocialPublishSchedules recovery snapshot', () => {
  it('drops a stale earliest job after another worker claims it', async () => {
    const table = new AlignmentTable();
    supabase.getPipelineSupabase.mockReturnValue({
      from: vi.fn(() => table),
    });

    await expect(alignPendingSocialPublishSchedules()).rejects.toMatchObject({
      message: 'alignment list failed before claim transition',
    });
    await expect(alignPendingSocialPublishSchedules()).resolves.toBe(1);

    expect(table.updates).toEqual([
      {
        id: 'target',
        status: 'queued',
        patch: {
          scheduled_at: '2026-08-20T03:00:00.000Z',
          next_attempt_at: '2026-08-20T03:00:00.000Z',
        },
      },
    ]);
  });
});
