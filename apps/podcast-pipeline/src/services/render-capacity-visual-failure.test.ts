import { describe, expect, it } from 'vitest';

import {
  evaluatePendingRenderWork,
  type RenderWorkSnapshot,
  type VisualWorkRow,
} from './render-capacity.js';
import { EPISODE_VIDEO_VISUAL_VERSION } from './video-jobs.js';

const NOW = Date.parse('2026-09-01T00:00:00.000Z');

function failedVisual(
  overrides: Partial<VisualWorkRow> = {},
): VisualWorkRow {
  return {
    episode_id: 'episode-1',
    status: 'failed',
    visual_version: EPISODE_VIDEO_VISUAL_VERSION,
    visual_hash: null,
    next_attempt_at: new Date(NOW).toISOString(),
    attempt_count: 3,
    lease_expires_at: null,
    telegram_chat_id: '42',
    failure_notified_at: null,
    ...overrides,
  };
}

function snapshot(visual: VisualWorkRow): RenderWorkSnapshot {
  return { visuals: [visual], videos: [], nowMs: NOW };
}

describe('visual failure render-capacity wake reason', () => {
  it('wakes the on-demand render group until a terminal visual failure notice is delivered', () => {
    expect(evaluatePendingRenderWork(snapshot(failedVisual()))).toEqual({
      reasons: ['visual:unnotified-failure:episode-1'],
      telegramChatId: '42',
    });
  });

  it('stops waking once the visual failure notification is stamped', () => {
    expect(
      evaluatePendingRenderWork(
        snapshot(
          failedVisual({
            failure_notified_at: '2026-09-01T00:01:00.000Z',
          }),
        ),
      ),
    ).toBeNull();
  });

  it('does not wake a failed visual row that has no Telegram destination', () => {
    expect(
      evaluatePendingRenderWork(
        snapshot(failedVisual({ telegram_chat_id: null })),
      ),
    ).toBeNull();
  });
});
