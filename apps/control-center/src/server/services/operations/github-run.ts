import { z } from 'zod';

export const GITHUB_HOUR_MS = 60 * 60 * 1000;

export const githubIsoTimestamp = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)));

export const githubRunsEnvelopeSchema = z.object({
  workflow_runs: z.array(z.unknown()),
});

export const githubCompletedRunSchema = z.object({
  status: z.string(),
  conclusion: z.string().nullish(),
  created_at: githubIsoTimestamp,
  run_started_at: githubIsoTimestamp.nullish(),
  html_url: z.string().nullish(),
});

export interface GithubRunTiming {
  conclusion: string | null;
  startedAt: Date;
  url: string | null;
}

export function githubRunTiming(run: {
  conclusion?: string | null;
  created_at: string;
  run_started_at?: string | null;
  html_url?: string | null;
}): GithubRunTiming {
  return {
    conclusion: run.conclusion ?? null,
    startedAt: new Date(run.run_started_at ?? run.created_at),
    url: run.html_url ?? null,
  };
}

export function githubRunEvidence(input: {
  failureStreak: number;
  startedAt: Date;
  conclusion: string | null;
}): {
  failureStreak: number;
  lastRunAt: string;
  lastConclusion: string | null;
} {
  return {
    failureStreak: input.failureStreak,
    lastRunAt: input.startedAt.toISOString(),
    lastConclusion: input.conclusion,
  };
}

export function consecutiveCount<T>(
  runs: readonly T[],
  matches: (run: T) => boolean,
): number {
  let count = 0;
  for (const run of runs) {
    if (!matches(run)) {
      break;
    }
    count += 1;
  }
  return count;
}
