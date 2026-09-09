import type { SocialGrowthJourney } from '../../shared/waitlist-growth.js';
import type { ControlCenterConfig } from '../config/env.js';
import { createAsyncCache } from './cache.js';
import { collectPosthogSignals } from './operations/posthog.js';

const TTL_MS = 15 * 60_000;

export function createGrowthJourneyService(input: {
  config: ControlCenterConfig;
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());
  const cache = createAsyncCache({
    ttlMs: TTL_MS,
    load: () => loadGrowthJourney({ config: input.config, now: now() }),
  });
  return { getJourney: (force = false) => cache.get(force) };
}

export async function loadGrowthJourney(input: {
  config: ControlCenterConfig;
  now: Date;
  fetchImpl?: typeof fetch;
}): Promise<SocialGrowthJourney> {
  const signals = await collectPosthogSignals({
    config: input.config,
    now: input.now,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
  });
  const signal = signals.find(
    (candidate) => candidate.fingerprint === 'posthog:audience/project',
  );
  if (!signal || signal.status !== 'healthy') {
    return unavailable(
      signal?.detail ?? 'PostHog acquisition telemetry is unavailable',
    );
  }

  const read = (key: string): number | null => {
    const value = signal.evidence[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };
  const values = {
    landingVisitors30d: read('landingVisitors30d'),
    ctaUsers30d: read('ctaUsers30d'),
    appVisitors30d: read('appVisitors30d'),
    walletConnectedUsers30d: read('walletConnectedUsers30d'),
    landingThreads30d: read('landingThreads30d'),
    landingX30d: read('landingX30d'),
    landingYoutube30d: read('landingYoutube30d'),
    landingRednote30d: read('landingRednote30d'),
    landingDirect30d: read('landingDirect30d'),
    landingOther30d: read('landingOther30d'),
  };
  if (Object.values(values).some((value) => value === null)) {
    return unavailable('PostHog journey query returned incomplete evidence');
  }

  return {
    status: 'ok',
    message: null,
    landingVisitors30d: values.landingVisitors30d!,
    ctaUsers30d: values.ctaUsers30d!,
    appVisitors30d: values.appVisitors30d!,
    walletConnectedUsers30d: values.walletConnectedUsers30d!,
    landingThreads30d: values.landingThreads30d!,
    landingX30d: values.landingX30d!,
    landingYoutube30d: values.landingYoutube30d!,
    landingRednote30d: values.landingRednote30d!,
    landingDirect30d: values.landingDirect30d!,
    landingOther30d: values.landingOther30d!,
  };
}

function unavailable(message: string): SocialGrowthJourney {
  return {
    status: 'unavailable',
    message,
    landingVisitors30d: null,
    ctaUsers30d: null,
    appVisitors30d: null,
    walletConnectedUsers30d: null,
    landingThreads30d: null,
    landingX30d: null,
    landingYoutube30d: null,
    landingRednote30d: null,
    landingDirect30d: null,
    landingOther30d: null,
  };
}
