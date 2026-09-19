import { afterEach, describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../../config/env.js';
import { collectPosthogSignals, readPosthogGrowthJourney } from './posthog.js';

const NOW = new Date('2026-08-28T09:00:00.000Z');
const CONFIG = readControlCenterConfig({
  POSTHOG_PERSONAL_API_KEY: 'phx-key',
  POSTHOG_PROJECT_ID: '4242',
});
const ROW = [318, 1204, 90, 300, 4, 12, 20, 55, 8, 21, 6, 0, 0];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('posthog coverage', () => {
  it('falls back to the global fetch for the audience read', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ results: [ROW] }));
    vi.stubGlobal('fetch', fetchImpl);

    const signals = await collectPosthogSignals({ config: CONFIG, now: NOW });

    expect(fetchImpl).toHaveBeenCalled();
    expect(signals[0]?.fingerprint).toBe('posthog:audience/project');
  });

  it('rejects a landing source row that cannot be parsed', async () => {
    const fetchImpl = (async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        query: { kind: string; query?: string };
      };
      if (
        body.query.kind === 'HogQLQuery' &&
        body.query.query?.includes('GROUP BY source')
      ) {
        return Response.json({ results: [['threads', 'not-a-number']] });
      }
      if (body.query.kind === 'HogQLQuery') {
        return Response.json({ results: [ROW] });
      }
      return Response.json({
        results: [
          { order: 0, count: 10 },
          { order: 1, count: 5 },
        ],
      });
    }) as typeof fetch;

    await expect(
      readPosthogGrowthJourney({ config: CONFIG, fetchImpl }),
    ).rejects.toThrow('unusable row');
  });

  it('defaults missing landing sources to zero', async () => {
    const fetchImpl = (async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        query: { kind: string; query?: string };
      };
      if (
        body.query.kind === 'HogQLQuery' &&
        body.query.query?.includes('GROUP BY source')
      ) {
        return Response.json({ results: [['threads', 5]] });
      }
      if (body.query.kind === 'HogQLQuery') {
        return Response.json({ results: [ROW] });
      }
      return Response.json({
        results: [
          { order: 0, count: 100 },
          { order: 1, count: 7 },
        ],
      });
    }) as typeof fetch;

    const journey = await readPosthogGrowthJourney({
      config: CONFIG,
      fetchImpl,
    });

    expect(journey).toMatchObject({
      landingThreads30d: 5,
      landingX30d: 0,
      landingYoutube30d: 0,
      landingRednote30d: 0,
      landingDirect30d: 0,
      landingOther30d: 0,
      appVisitors30d: 55,
      walletConnectedUsers30d: 21,
    });
  });

  it('reads the growth journey through the global fetch when no impl is injected', async () => {
    const fetchImpl = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        query: { kind: string; query?: string };
      };
      if (
        body.query.kind === 'HogQLQuery' &&
        body.query.query?.includes('GROUP BY source')
      ) {
        return Response.json({ results: [] });
      }
      if (body.query.kind === 'HogQLQuery') {
        return Response.json({ results: [ROW] });
      }
      return Response.json({
        results: [
          { order: 0, count: 50 },
          { order: 1, count: 3 },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchImpl as unknown as typeof fetch);

    const journey = await readPosthogGrowthJourney({ config: CONFIG });

    expect(fetchImpl).toHaveBeenCalled();
    expect(journey.landingThreads30d).toBe(0);
    expect(journey.landingVisitors30d).toBe(50);
  });
});
