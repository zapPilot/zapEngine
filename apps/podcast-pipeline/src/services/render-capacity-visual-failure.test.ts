import { describe, expect, it } from 'vitest';

import {
  evaluatePendingRenderWork,
  type RenderWorkSnapshot,
} from './render-capacity.js';

const NOW = Date.parse('2026-09-01T00:00:00.000Z');

function snapshot(
  visualFailureNotices: RenderWorkSnapshot['visualFailureNotices'],
): RenderWorkSnapshot {
  return { visuals: [], videos: [], visualFailureNotices, nowMs: NOW };
}

describe('visual failure render-capacity wake reason', () => {
  it('wakes the on-demand render group while a terminal visual notice is pending', () => {
    expect(
      evaluatePendingRenderWork(
        snapshot([{ episode_id: 'episode-1', telegram_chat_id: '42' }]),
      ),
    ).toEqual({
      reasons: ['visual:unnotified-failure:episode-1'],
      telegramChatId: '42',
    });
  });

  it('does not add a visual-failure wake before the recovery RPC is available', () => {
    expect(evaluatePendingRenderWork(snapshot(undefined))).toBeNull();
  });
});
