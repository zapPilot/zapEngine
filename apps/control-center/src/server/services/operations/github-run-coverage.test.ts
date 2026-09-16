import { describe, expect, it } from 'vitest';

import {
  consecutiveCount,
  githubRunEvidence,
  githubRunTiming,
  isGithubOperationalFailure,
} from './github-run.js';

describe('github-run fallbacks', () => {
  it('defaults missing conclusion, start timestamp and url to nulls', () => {
    const timing = githubRunTiming({ created_at: '2026-09-01T00:00:00.000Z' });

    expect(timing).toEqual({
      conclusion: null,
      startedAt: new Date('2026-09-01T00:00:00.000Z'),
      url: null,
    });
  });

  it('prefers run_started_at over created_at when both are present', () => {
    const timing = githubRunTiming({
      conclusion: 'failure',
      created_at: '2026-09-01T00:00:00.000Z',
      run_started_at: '2026-09-01T00:05:00.000Z',
      html_url: 'https://example.com/run/1',
    });

    expect(timing.startedAt).toEqual(new Date('2026-09-01T00:05:00.000Z'));
    expect(timing.url).toBe('https://example.com/run/1');
  });

  it('reports a null conclusion as a non-operational outcome', () => {
    expect(isGithubOperationalFailure(null)).toBe(false);
    expect(isGithubOperationalFailure(undefined)).toBe(false);
    expect(consecutiveCount([], () => true)).toBe(0);
    expect(
      githubRunEvidence({
        failureStreak: 0,
        startedAt: new Date('2026-09-01T00:00:00.000Z'),
        conclusion: null,
      }),
    ).toEqual({
      failureStreak: 0,
      lastRunAt: '2026-09-01T00:00:00.000Z',
      lastConclusion: null,
    });
  });
});
