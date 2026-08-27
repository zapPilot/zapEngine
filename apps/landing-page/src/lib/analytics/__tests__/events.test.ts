import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const posthogMocks = vi.hoisted(() => ({ capture: vi.fn() }));

vi.mock('posthog-js', () => ({
  default: { capture: posthogMocks.capture },
}));

async function importEvents() {
  return import('../events');
}

describe('landing analytics events', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sends the pitch view to both sinks', async () => {
    const { trackPitchView } = await importEvents();

    trackPitchView();

    expect(window.gtag).toHaveBeenCalledWith('event', 'pitch_view', {
      source: 'pitch_page',
    });
    expect(posthogMocks.capture).toHaveBeenCalledWith('pitch_view', {
      source: 'pitch_page',
    });
  });

  it('sends the viewed slide id', async () => {
    const { trackSlideViewed } = await importEvents();

    trackSlideViewed('ask');

    expect(posthogMocks.capture).toHaveBeenCalledWith('pitch_slide_viewed', {
      slide_id: 'ask',
    });
  });

  it('labels a CTA click with the section it came from', async () => {
    const { trackCtaClicked } = await importEvents();

    trackCtaClicked('navbar');

    expect(window.gtag).toHaveBeenCalledWith('event', 'cta_clicked', {
      location: 'navbar',
      target: 'app',
    });
    expect(posthogMocks.capture).toHaveBeenCalledWith('cta_clicked', {
      location: 'navbar',
      target: 'app',
    });
  });

  it('keeps sending to Google Analytics when no PostHog project is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');

    const { trackCtaClicked } = await importEvents();
    trackCtaClicked('hero');

    expect(window.gtag).toHaveBeenCalledTimes(1);
    expect(posthogMocks.capture).not.toHaveBeenCalled();
  });
});
