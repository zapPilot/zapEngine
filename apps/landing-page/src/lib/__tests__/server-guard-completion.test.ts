import { afterEach, describe, expect, it, vi } from 'vitest';

const posthog = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock('posthog-js', () => ({ default: posthog }));

import { trackPitchView } from '@/lib/analytics/events';
import {
  captureWaitlistFirstTouch,
  readWaitlistAttribution,
} from '@/lib/waitlist-attribution';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('landing browser API server guards', () => {
  it('keeps first-touch capture inert during server rendering', () => {
    vi.stubGlobal('window', undefined);
    expect(captureWaitlistFirstTouch()).toBeNull();
  });

  it('keeps stored-attribution lookup inert during server rendering', () => {
    vi.stubGlobal('window', undefined);
    expect(readWaitlistAttribution()).toBeNull();
  });

  it('does not emit analytics without a browser global', () => {
    vi.stubGlobal('window', undefined);
    expect(() => trackPitchView()).not.toThrow();
    expect(posthog.capture).not.toHaveBeenCalled();
  });
});
