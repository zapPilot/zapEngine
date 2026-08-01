import { describe, expect, it, vi } from 'vitest';

import {
  handoffAudioToVideo,
  isVideoHandoffSeekConfirmed,
  resolveActiveMediaClock,
} from '@/integration/episodeMediaSync';

describe('episode media handoff synchronization', () => {
  it('pauses audio and starts the video session at the audio clock', () => {
    const pauseAudio = vi.fn();

    const session = handoffAudioToVideo({
      audioTimeSeconds: 37,
      videoDurationSeconds: 180,
      playbackRate: 1.25,
      shouldPlay: true,
      pauseAudio,
    });

    expect(pauseAudio).toHaveBeenCalledOnce();
    expect(session).toEqual({
      initialTimeSeconds: 37,
      playbackRate: 1.25,
      shouldPlay: true,
    });
  });

  it('does not confirm autoplay until the native video seek reaches the target', () => {
    expect(isVideoHandoffSeekConfirmed(36.5, 37)).toBe(false);
    expect(isVideoHandoffSeekConfirmed(36.8, 37)).toBe(true);
    expect(isVideoHandoffSeekConfirmed(37.3, 37)).toBe(true);
  });

  it('uses the advancing video clock instead of the paused audio clock', () => {
    const clock = resolveActiveMediaClock({
      videoClock: {
        currentTimeSeconds: 52,
        durationSeconds: 180,
      },
      isCurrentAudio: true,
      audioCurrentTimeSeconds: 37,
      audioDurationSeconds: 175,
    });

    expect(clock).toEqual({
      currentTimeSeconds: 52,
      durationSeconds: 180,
    });
  });

  it('falls back to the audio clock when video is inactive', () => {
    expect(
      resolveActiveMediaClock({
        videoClock: null,
        isCurrentAudio: true,
        audioCurrentTimeSeconds: 37,
        audioDurationSeconds: 175,
      }),
    ).toEqual({
      currentTimeSeconds: 37,
      durationSeconds: 175,
    });
  });

  it('returns no active clock for an unrelated episode', () => {
    expect(
      resolveActiveMediaClock({
        videoClock: null,
        isCurrentAudio: false,
        audioCurrentTimeSeconds: 37,
        audioDurationSeconds: 175,
      }),
    ).toBeNull();
  });
});
