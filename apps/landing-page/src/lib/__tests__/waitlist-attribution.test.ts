import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureWaitlistFirstTouch,
  readWaitlistAttribution,
} from '../waitlist-attribution';

const KEY = 'zap-pilot:waitlist-first-touch:v1';
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});

describe('waitlist attribution', () => {
  it('captures, trims, and preserves first touch', () => {
    window.history.replaceState(
      {},
      '',
      '/pitch?utm_source=%20video%20&utm_medium=social&utm_campaign=launch&utm_content=en',
    );
    const captured = captureWaitlistFirstTouch();
    expect(captured).toMatchObject({
      landingPath:
        '/pitch?utm_source=%20video%20&utm_medium=social&utm_campaign=launch&utm_content=en',
      utmSource: 'video',
      utmMedium: 'social',
      utmCampaign: 'launch',
      utmContent: 'en',
    });
    window.history.replaceState({}, '', '/other?utm_source=changed');
    expect(captureWaitlistFirstTouch()).toEqual(captured);
  });

  it.each([null, '{', '{}', '{"landingPath":""}'])(
    'recovers from invalid storage %s',
    (raw) => {
      if (raw !== null) localStorage.setItem(KEY, raw);
      expect(readWaitlistAttribution()).toMatchObject({ landingPath: '/' });
    },
  );

  it('sanitizes optional stored fields', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        landingPath: '/first',
        referrer: '  https://ref.test  ',
        utmSource: 1,
        utmMedium: ' ',
        utmCampaign: ' campaign ',
        utmContent: ' content ',
      }),
    );
    expect(readWaitlistAttribution()).toEqual({
      landingPath: '/first',
      referrer: 'https://ref.test',
      utmCampaign: 'campaign',
      utmContent: 'content',
    });
  });

  it('still returns attribution when storage writes fail', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(captureWaitlistFirstTouch()).toMatchObject({ landingPath: '/' });
  });
});
