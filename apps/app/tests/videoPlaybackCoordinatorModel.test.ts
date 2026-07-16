import { describe, expect, it, vi } from 'vitest';

import { createVideoPlaybackCoordinatorModel } from '@/integration/videoPlaybackCoordinatorModel';

describe('video playback coordinator model', () => {
  it('pauses the registered video', () => {
    const pause = vi.fn();
    const model = createVideoPlaybackCoordinatorModel();

    model.registerVideo(pause);
    model.pauseActiveVideo();

    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('routes pause to the most recently registered video', () => {
    const first = vi.fn();
    const latest = vi.fn();
    const model = createVideoPlaybackCoordinatorModel();

    model.registerVideo(first);
    model.registerVideo(latest);
    model.pauseActiveVideo();

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it('does not evict a newer video when an older registration unregisters', () => {
    const first = vi.fn();
    const latest = vi.fn();
    const model = createVideoPlaybackCoordinatorModel();

    const unregisterFirst = model.registerVideo(first);
    model.registerVideo(latest);
    unregisterFirst();
    model.pauseActiveVideo();

    expect(latest).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('stops pausing after the active video unregisters', () => {
    const pause = vi.fn();
    const model = createVideoPlaybackCoordinatorModel();

    const unregister = model.registerVideo(pause);
    unregister();
    model.pauseActiveVideo();

    expect(pause).not.toHaveBeenCalled();
  });
});
